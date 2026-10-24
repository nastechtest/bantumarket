/**
 * The gateway transport: POST a batch to the telemetry endpoint, with a `sendBeacon` path for the
 * flush that happens while the page is going away.
 *
 * Four properties that are the whole point of this file, each asserted in `gateway.test.ts`:
 *
 *  1. **No credentials.** `credentials: 'omit'` and no `Authorization` header. A sign-in cookie on a
 *     telemetry request would let the analytics store identify the buyer by session even in a build
 *     where consent was refused, and would put a signed-in person's identity next to every row. The
 *     endpoint is anonymous by construction or it is not POPIA-minimised.
 *  2. **Consent is re-checked at the wire.** The queue gates, and this checks again, because the two
 *     can be separated by an unknown amount of time and by a withdrawal that happened in another tab.
 *  3. **A batch containing anything PII-shaped is refused whole.** Partial sending is worse than none:
 *     it produces a funnel with a hole in it that looks like buyer behaviour.
 *  4. **Failures are terminal for the batch, except a plain network error on a live page.** A 4xx is a
 *     contract mismatch — retrying it turns a deployment bug into a request storm on a buyer's metered
 *     connection, which in South Africa is a real cost to a real person.
 */
import { isConsentCategory, type ConsentCategory } from '../../../lib/consent/types.js';
import { scanProps } from '../pii-guards.js';
import { refPropsOf, type EventName } from '../events.js';
import {
  MAX_BATCH_BYTES,
  batchConsentMismatches,
  estimateBatchBytes,
  type Batch,
  type EventTransport,
  type SendResult,
} from '../transport.js';

/** Asserted, not live: the PHP backend has no HTTP layer yet (ADR 0002). */
export const TELEMETRY_ENDPOINT = '/v1/telemetry/events';

export interface GatewayOptions {
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
  /** `navigator.sendBeacon` shape, injectable so the pagehide path is testable without a browser. */
  readonly beacon?: (url: string, data: string) => boolean;
  readonly now: () => number;
  readonly allowed: (category: ConsentCategory) => boolean;
  readonly timeoutMs?: number;
  readonly maxBatchBytes?: number;
  readonly onDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface GatewayTransport extends EventTransport {
  readonly requests: readonly GatewayRequest[];
}

export interface GatewayRequest {
  readonly url: string;
  readonly method: 'POST';
  readonly credentials: 'omit';
  readonly via: 'fetch' | 'beacon';
  readonly bytes: number;
  readonly eventCount: number;
  readonly categories: readonly ConsentCategory[];
  readonly headers: Readonly<Record<string, string>>;
  readonly flushReason: Batch['flushReason'];
}

const DEFAULT_TIMEOUT_MS = 8_000;

export function createGatewayTransport(options: GatewayOptions): GatewayTransport {
  const endpoint = options.endpoint ?? TELEMETRY_ENDPOINT;
  const maxBytes = options.maxBatchBytes ?? MAX_BATCH_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requests: GatewayRequest[] = [];

  const diagnose = (message: string, detail?: Record<string, unknown>): void => {
    try {
      options.onDiagnostic?.(message, detail);
    } catch {
      /* never let a logging hook break the send path */
    }
  };

  function describe(batch: Batch): GatewayRequest {
    return {
      url: endpoint,
      method: 'POST',
      credentials: 'omit',
      via: 'fetch',
      bytes: estimateBatchBytes(batch),
      eventCount: batch.events.length,
      categories: [...new Set(batch.events.map((e) => e.category))].filter(isConsentCategory),
      // `content-type` and nothing else: no cookie, no bearer, no device header.
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      flushReason: batch.flushReason,
    };
  }

  /** The last gate before bytes move. Returns a failure, or null when the batch is legal to send. */
  function preflight(batch: Batch): SendResult | null {
    const mismatch = batchConsentMismatches(batch, options.allowed);
    if (mismatch.length > 0) {
      diagnose(`gateway refused batch: consent withdrawn for ${mismatch.join(', ')}`, { mismatch });
      return { ok: false, kind: 'consent_revoked', retryable: false };
    }

    const leaks: string[] = [];
    for (const event of batch.events) {
      const hits = scanProps(
        event.props as Record<string, unknown>,
        refPropsOf(event.name as EventName),
      );
      for (const hit of hits) leaks.push(`${event.name}.${hit.path}(${hit.kind})`);
    }
    if (leaks.length > 0) {
      diagnose(`gateway refused batch: PII-shaped values ${leaks.join(', ')}`, { leaks });
      return { ok: false, kind: 'rejected', retryable: false };
    }

    if (estimateBatchBytes(batch) > maxBytes) {
      diagnose(`gateway dropped batch: ${estimateBatchBytes(batch)} B over the ${maxBytes} B cap`);
      return { ok: false, kind: 'oversize', retryable: false };
    }
    return null;
  }

  return {
    id: 'gateway',
    async send(batch): Promise<SendResult> {
      const refusal = preflight(batch);
      if (refusal !== null) return refusal;

      const body = JSON.stringify(batch);
      const record = describe(batch);
      requests.push(record);

      // Going away: a `fetch` started during unload may be cancelled by the browser, and losing the
      // last batch of a session is how the final funnel step always reads as abandonment. A beacon is
      // fire-and-forget, so its result is an honest "we handed it over", not a confirmed delivery.
      if ((batch.flushReason === 'pagehide' || batch.flushReason === 'shutdown') && typeof options.beacon === 'function') {
        let queued = false;
        try {
          queued = options.beacon(endpoint, body);
        } catch {
          queued = false;
        }
        diagnose(`gateway beacon ${queued ? 'handed over' : 'rejected'} ${batch.events.length} event(s)`);
        return queued ? { ok: true, accepted: batch.events.length, via: 'beacon' } : { ok: false, kind: 'network', retryable: false };
      }

      const doFetch = options.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
      if (typeof doFetch !== 'function') {
        diagnose('gateway has no fetch implementation available');
        return { ok: false, kind: 'network', retryable: false };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body,
          credentials: 'omit',
          // A hidden tab that is flushing its last batch must not have the request cancelled because
          // the document is unloading; `keepalive` is the mechanism, and the payload is small by cap.
          keepalive: batch.flushReason === 'visibility_hidden' || batch.flushReason === 'pagehide',
          signal: controller.signal,
        });
      } catch {
        // Never propagate the cause's message: a fetch error string embeds the full URL, and if a
        // proxy ever puts a token in it, that is a leak through a log line.
        diagnose('gateway network failure', { events: batch.events.length });
        return { ok: false, kind: 'network', retryable: true };
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) return { ok: true, accepted: batch.events.length, via: 'fetch' };

      // 429/503 say "come back later"; anything else 4xx is a contract problem the client cannot fix.
      const retryable = response.status === 429 || response.status === 503;
      diagnose(`gateway rejected with ${response.status}`, { status: response.status, retryable });
      return { ok: false, kind: 'rejected', retryable };
    },
    get requests() {
      return requests;
    },
  };
}

/**
 * The `navigator.sendBeacon` shim the app shell passes in. Kept as a helper rather than reached for
 * inside `send`, so a host without a beacon (older Android WebViews, which are the pilot's actual
 * devices) is a visible configuration choice and not a silent fallback.
 */
export function browserBeaconSender(): ((url: string, data: string) => boolean) | undefined {
  const nav = (globalThis as { navigator?: { sendBeacon?: (url: string, data: string | Blob) => boolean } }).navigator;
  if (nav && typeof nav.sendBeacon === 'function') {
    return (url, data) => {
      try {
        // A Blob with an explicit type: a plain string is sent as text/plain by some engines and a
        // strict gateway would then 415 the last batch of every session.
        return nav.sendBeacon?.(url, new Blob([data], { type: 'application/json' })) ?? false;
      } catch {
        return false;
      }
    };
  }
  return undefined;
}
