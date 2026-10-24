/**
 * The composed HTTP client: policy in one place, chain order fixed here, everything else delegated
 * to a middleware that can be tested on its own.
 *
 * Order is a correctness property, not a style choice, so it is not a caller argument:
 *   cache-control → auth → retry → request-id → timeouts → decompress-hint → terminal
 * Read it as "what may skip the network, what must be authorised first, what may be repeated, what
 * identifies each repeat, how long each repeat gets, and how big a repeat may be". Putting retry
 * above auth would ask for a fresh token per attempt; putting timeouts above retry would make one
 * deadline cover every attempt together, which is a different and more surprising promise — a
 * per-attempt deadline is what a buyer reads as "it tried again promptly, then told me".
 *
 * The client also exposes `asTransport()`, the `Transport` seam from `transport.ts`, so wave A's
 * `media.js` / `catalogue.js` / `orders.js` can run on this pipeline without a rewrite. The bridge
 * returns the unwrapped payload — the shape those modules already decode themselves — so swapping it
 * in changes the cross-cutting behaviour and nothing else.
 */

import type { Transport, TransportRequest } from '../transport.js';
import type { IdempotencyKeys, IntentId } from '../idempotency.js';
import { parseRetryAfter } from '../errors.js';
import { createAbortScope, isReportableFailure } from '../abort.js';
import type { AbortScope } from '../abort.js';
import { createClockSkew } from './clock-skew.js';
import type { ClockSkew } from './clock-skew.js';
import { composeChain } from './middleware.js';
import type {
  HttpMethod,
  HttpRequest,
  Middleware,
  MiddlewareContext,
  MiddlewareServices,
  QueryValue,
  RawResponse,
  RequestPolicy,
} from './middleware.js';
import { authMiddleware } from './middleware/auth.js';
import type { AuthGateway } from './middleware/auth.js';
import { cacheControlMiddleware, createResponseCache } from './middleware/cache-control.js';
import type { ResponseCache } from './middleware/cache-control.js';
import { decompressHintMiddleware } from './middleware/decompress-hint.js';
import type { EncodingReport } from './middleware/decompress-hint.js';
import { defaultId, requestIdMiddleware } from './middleware/request-id.js';
import { retryMiddleware } from './middleware/retry.js';
import type { BlockedRetry, RetryNotice } from './middleware/retry.js';
import { timeoutsMiddleware } from './middleware/timeouts.js';
import { createFetchTerminal, headerValue } from './fetch-impl.js';
import type { HttpIo } from './fetch-impl.js';
import { CORRELATION_ID_HEADER, IDEMPOTENCY_KEY_HEADER, setHeader } from './headers.js';
import { parseFailure, parseSuccess, serverTimeMsOf } from './envelope.js';
import type { EnvelopeMeta, EnvelopeSuccess } from './envelope.js';
import { DEFAULT_HTTP_BACKOFF } from '../ws/backoff.js';
import type { BackoffPolicy } from '../ws/backoff.js';
import { contractViolation, isHttpFailure } from './errors.js';

/** `DEFAULT_TIMEOUT_MS` from `transport.ts`, restated as a default rather than as a second rule. */
export const DEFAULT_POLICY: RequestPolicy = {
  timeoutMs: 8000,
  attempts: 3,
  backoffBaseMs: DEFAULT_HTTP_BACKOFF.baseMs,
  backoffCeilingMs: DEFAULT_HTTP_BACKOFF.ceilingMs,
  retryBudgetMs: 10_000,
  retryAfterCeilingMs: 30_000,
  // Only statuses that say "the server is not the problem". A 500 from this ledger means the request
  // was understood and refused, and repeating it neither helps nor is free.
  retryOnStatuses: [408, 429, 502, 503, 504],
  jitter: 'full',
};

export interface FailureNotice {
  readonly path: string;
  readonly method: string;
  readonly error: unknown;
}

export interface HttpClientOptions {
  readonly baseUrl: string;
  /** The I/O seam. Tests inject this; production uses `fetchImpl` or the platform `fetch`. */
  readonly io?: HttpIo;
  readonly fetchImpl?: typeof fetch;
  readonly policy?: Partial<RequestPolicy>;
  readonly backoff?: BackoffPolicy;
  /** Passed in, never created here: whoever owns the intent decides when the intent is spent. */
  readonly keys?: IdempotencyKeys;
  readonly auth?: AuthGateway;
  readonly cache?: ResponseCache;
  /** Page-level cancellation scope. Defaults to a client-owned root scope. */
  readonly scope?: AbortScope;
  readonly services?: Partial<MiddlewareServices>;
  /** Replaces the default chain entirely — the order documented above is the default. */
  readonly middleware?: readonly Middleware[];
  readonly onFailure?: (notice: FailureNotice) => void;
  readonly onRetry?: (info: RetryNotice) => void;
  readonly onBlockedRetry?: (info: BlockedRetry) => void;
  readonly onEncoding?: (info: EncodingReport) => void;
  readonly skew?: ClockSkew;
  /** Device clock, injectable so a skewed-clock test never has to touch `Date`. */
  readonly localNow?: () => number;
}

export interface ClientDiagnostics {
  readonly requestsSent: number;
  readonly reportableFailures: number;
  /** Cancellations this layer swallowed on purpose — the number that keeps an error budget honest. */
  readonly ignoredAborts: number;
  readonly cacheHits: number;
  readonly blockedUnkeyedRetries: number;
  readonly retries: number;
  readonly bytesReceived: number;
}

export interface HttpClient {
  readonly policy: RequestPolicy;
  readonly scope: AbortScope;
  readonly skew: ClockSkew;
  readonly cache: ResponseCache;
  /** Envelope-parsed request: resolves with `data`, typed as the wire shape. */
  request<T>(request: HttpRequest): Promise<T>;
  /** The same request with the envelope `meta` — what pagination needs for a cursor and a server time. */
  send<T>(request: HttpRequest): Promise<EnvelopeSuccess<T>>;
  get<T>(path: string, query?: Readonly<Record<string, QueryValue>>): Promise<T>;
  post<T>(path: string, body: unknown, intent: IntentId): Promise<T>;
  /** The bridge for wave A's modules. */
  asTransport(): Transport;
  diagnostics(): ClientDiagnostics;
}

export function resolvePolicy(patch: Partial<RequestPolicy> | undefined): RequestPolicy {
  const merged: RequestPolicy = { ...DEFAULT_POLICY, ...(patch ?? {}) };
  if (merged.attempts < 1) {
    throw contractViolation('out_of_range', 'policy.attempts', merged.attempts, 'at least 1 attempt');
  }
  if (merged.timeoutMs <= 0) {
    throw contractViolation('out_of_range', 'policy.timeoutMs', merged.timeoutMs, 'a positive deadline in ms');
  }
  if (merged.backoffBaseMs <= 0 || merged.backoffCeilingMs < merged.backoffBaseMs) {
    throw contractViolation(
      'out_of_range',
      'policy.backoffCeilingMs',
      merged.backoffCeilingMs,
      'a ceiling at or above the base delay',
    );
  }
  return merged;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const policy = resolvePolicy(options.policy);
  const backoff: BackoffPolicy = options.backoff ?? {
    baseMs: policy.backoffBaseMs,
    factor: DEFAULT_HTTP_BACKOFF.factor,
    ceilingMs: policy.backoffCeilingMs,
    jitter: policy.jitter,
    maxTotalMs: policy.retryBudgetMs,
  };

  const services: MiddlewareServices = {
    sleep: options.services?.sleep ?? defaultSleep,
    rng: options.services?.rng ?? ((): number => Math.random()),
    now: options.services?.now ?? options.localNow ?? ((): number => Date.now()),
    warn: options.services?.warn ?? ((message: string): void => console.warn(`[api-client] ${message}`)),
  };

  const scope = options.scope ?? createAbortScope('http-client');
  const cache = options.cache ?? createResponseCache({ now: services.now });
  const skew = options.skew ?? createClockSkew(options.localNow === undefined ? {} : { localNow: options.localNow });

  const counters = {
    requestsSent: 0,
    reportableFailures: 0,
    ignoredAborts: 0,
    cacheHits: 0,
    blockedUnkeyedRetries: 0,
    retries: 0,
    bytesReceived: 0,
  };

  const chain: readonly Middleware[] = options.middleware ?? [
    cacheControlMiddleware({
      cache,
      onHit: (): void => {
        counters.cacheHits += 1;
      },
    }),
    authMiddleware({ gateway: options.auth }),
    retryMiddleware({
      backoff,
      onRetry: (info): void => {
        counters.retries += 1;
        options.onRetry?.(info);
      },
      onBlockedRetry: (info): void => {
        counters.blockedUnkeyedRetries += 1;
        options.onBlockedRetry?.(info);
      },
    }),
    requestIdMiddleware(),
    timeoutsMiddleware(),
    decompressHintMiddleware({
      onEncoding: (info): void => {
        counters.bytesReceived += info.bytes;
        options.onEncoding?.(info);
      },
    }),
  ];

  const terminal = createFetchTerminal({
    baseUrl: options.baseUrl,
    ...(options.io !== undefined ? { io: options.io } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });

  const runChain = composeChain(chain, async (ctx: MiddlewareContext): Promise<RawResponse> => {
    counters.requestsSent += 1;
    return await terminal(ctx);
  });

  /**
   * Headers this layer owns, applied once per logical request before the chain so the retry loop
   * cannot mint a second value for them.
   */
  function prepare(request: HttpRequest): HttpRequest {
    let next: HttpRequest = { ...request };
    // One correlation id per logical request. `x-request-id` is per attempt and is added by
    // request-id middleware; this is the value that ties those attempts together in a log.
    next = { ...next, headers: setHeader(next.headers, CORRELATION_ID_HEADER, defaultId()) };

    if (next.intent !== undefined && next.method !== 'GET') {
      if (options.keys === undefined) {
        services.warn(
          `${next.method} ${next.path} declared an intent but the client has no IdempotencyKeys: it goes out without a key and will not be retried.`,
        );
      } else {
        // Attached here, before the retry loop: every attempt replays the identical string, which is
        // the only thing that makes a double tap one order rather than two.
        next = {
          ...next,
          headers: setHeader(next.headers, IDEMPOTENCY_KEY_HEADER, options.keys.keyForIntent(next.intent)),
        };
      }
    }

    if (next.signal === undefined) next = { ...next, signal: scope.signal };
    return next;
  }

  async function send<T>(request: HttpRequest): Promise<EnvelopeSuccess<T>> {
    const prepared = prepare(request);
    const ctx: MiddlewareContext = { request: prepared, attempt: 1, policy, services, scope };

    let raw: RawResponse;
    try {
      raw = await runChain(ctx);
    } catch (error) {
      recordFailure(error, prepared);
      throw error;
    }

    if (!raw.ok) {
      const retryAfterMs = parseRetryAfter(headerValue(raw.headers, 'retry-after'));
      const failure = parseFailure(raw, ...(retryAfterMs !== undefined ? [retryAfterMs] : []));
      // Observed on a failure too: a 503 still came from the machine whose time a handover window is
      // measured against.
      skew.observe(headerTimeOnly(raw));
      recordFailure(failure, prepared);
      throw failure;
    }

    const parsed = parseSuccess<T>(raw, headerValue(raw.headers, 'x-request-id') ?? undefined);
    skew.observe(serverTimeMsOf(parsed.meta, raw));
    return parsed;
  }

  function recordFailure(error: unknown, request: HttpRequest): void {
    if (isReportableFailure(error)) {
      counters.reportableFailures += 1;
      options.onFailure?.({ path: request.path, method: request.method, error });
      return;
    }
    // A cancellation is counted, never reported: the number exists so a test can prove the failure
    // sink did not run, and so a support overlay can say "4 of these were you leaving the page".
    counters.ignoredAborts += 1;
  }

  async function request<T>(httpRequest: HttpRequest): Promise<T> {
    const envelope = await send<T>(httpRequest);
    return envelope.data;
  }

  function asTransport(): Transport {
    return {
      async request<T>(req: TransportRequest): Promise<T> {
        const query: Record<string, QueryValue> = { ...(req.query ?? {}) };
        const bridged: HttpRequest = {
          method: req.method,
          path: req.path,
          ...(Object.keys(query).length > 0 ? { query } : {}),
          ...(req.body !== undefined ? { body: req.body } : {}),
          ...(req.headers !== undefined ? { headers: req.headers } : {}),
          ...(req.timeoutMs !== undefined ? { timeoutMs: req.timeoutMs } : {}),
        };
        return await request<T>(bridged);
      },
    };
  }

  return {
    policy,
    scope,
    skew,
    cache,
    request,
    send,
    get: <T>(path: string, query?: Readonly<Record<string, QueryValue>>): Promise<T> =>
      request<T>({ method: 'GET' satisfies HttpMethod, path, ...(query !== undefined ? { query } : {}) }),
    post: <T>(path: string, body: unknown, intent: IntentId): Promise<T> =>
      request<T>({ method: 'POST', path, body, intent }),
    asTransport,
    diagnostics: (): ClientDiagnostics => ({ ...counters }),
  };
}

/** For a response with no parseable body, the only server time available is the transport `Date`. */
function headerTimeOnly(response: RawResponse): number | undefined {
  const meta: EnvelopeMeta = { requestId: undefined, serverTimeMs: undefined, raw: {} };
  return serverTimeMsOf(meta, response);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { isHttpFailure };
export type { AuthGateway, EnvelopeSuccess, HttpRequest, HttpIo };
