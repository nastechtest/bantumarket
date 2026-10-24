import type { Transport, TransportRequest, HttpMethod } from '@nastech/api-client';
import { ApiError, apiErrorFromStatus, hasIdempotencyKey } from '@nastech/api-client';
import { abortError } from './errors.js';

/**
 * The scripted transport.
 *
 * `packages/api-client/tests/fake-transport.ts` already does the one job that test package needs —
 * "return this, in this order" — and it is good at it. What it cannot express is the two shapes the
 * apps actually have to test against: latency that a client-side deadline must beat, and an
 * idempotency key that has ALREADY been spent. A double-tapped Buy button is not a sequencing problem
 * — it is the same key arriving twice, and a fake that answers each call from a queue hands the app
 * two orders and reports success. That is the money bug, and it is the reason this file exists.
 *
 * Contract it keeps from the real transport (asserted in `api/fake-transport.test.ts`):
 *  - status codes become the client's OWN `ApiError`, through `apiErrorFromStatus`, so a component
 *    that branches on `error.kind` sees exactly what production would give it;
 *  - headers are captured as sent, so "was the key reused?" is a fact about the record, not a claim;
 *  - a hung request stays hung: the fake never resolves on its own, because proving the deadline
 *    fires requires the server to actually misbehave.
 */

export type PathMatcher = string | RegExp | ((req: TransportRequest) => boolean);

export interface ScriptedResponse<T = unknown> {
  readonly status?: number;
  readonly body?: T;
  /** ms before settling. Driven by `globalThis.setTimeout`, so `installFakeClock()` controls it. */
  readonly latencyMs?: number;
  readonly retryAfterMs?: number;
  readonly headers?: Record<string, string>;
}

type Handler = (req: TransportRequest, callIndex: number) => ScriptedResponse<unknown> | unknown;

interface Route {
  readonly method: HttpMethod | '*';
  readonly matcher: PathMatcher;
  readonly handler: Handler;
  /** How many times this route may be consumed; Infinity means it repeats forever. */
  remaining: number;
}

export interface IdempotencyRecord {
  readonly key: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly bodyFingerprint: string;
  readonly response: unknown;
  readonly errored: boolean;
  /** Owned by the fake: incremented on every replay of the key, read by the test. */
  hits: number;
}

export class FakeTransport implements Transport {
  readonly calls: TransportRequest[] = [];
  /** One entry per spent key — the evidence a double-charge test asserts on. */
  readonly idempotencyLog = new Map<string, IdempotencyRecord>();
  readonly replays: string[] = [];

  private readonly routes: Route[] = [];
  private defaultLatencyMs = 0;
  private hangAll = false;
  private pendingAborts = new Set<AbortController>();
  private nextId = 1;

  /**
   * `respond('GET', '/v1/orders/*, () => ({ status: 200, body: {...} }))` or the shorthand
   * `respond('GET', path, body)`. `times` limits the route so "fail once then succeed" stays a
   * two-line script instead of a handler holding mutable state.
   */
  respond(method: HttpMethod | '*', matcher: PathMatcher, response: ScriptedResponse | unknown | Handler, times = Infinity): this {
    const handler: Handler = typeof response === 'function' ? (response as Handler) : () => response;
    this.routes.push({ method, matcher, handler, remaining: times });
    return this;
  }

  /** Status → the client's real `ApiError`, via `apiErrorFromStatus`. No invented error class. */
  failWith(method: HttpMethod | '*', matcher: PathMatcher, status: number, options: { readonly retryAfterMs?: number; readonly times?: number } = {}): this {
    return this.respond(
      method,
      matcher,
      () => ({
        status,
        ...(options.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs }),
      }),
      options.times ?? Infinity,
    );
  }

  /** Every subsequent request hangs forever: the only way to prove a client-side deadline works. */
  hang(): this {
    this.hangAll = true;
    return this;
  }

  /** Applied to routes that do not specify their own latency. */
  setLatency(ms: number): this {
    this.defaultLatencyMs = ms;
    return this;
  }

  /**
   * Pre-spend a key: the next request carrying it is a REPLAY of `response`, exactly as the ledger
   * treats an already-recorded payment. `bodyFingerprint` is the JSON body the first attempt sent.
   */
  alreadySubmitted(key: string, request: Pick<TransportRequest, 'method' | 'path'>, response: unknown): this {
    this.idempotencyLog.set(key, {
      key,
      method: request.method,
      path: request.path,
      bodyFingerprint: '<pre-seeded>',
      response,
      errored: false,
      hits: 0,
    });
    return this;
  }

  /** Abort every in-flight request — the "buyer navigated away" path. */
  abortPending(): void {
    for (const controller of this.pendingAborts) controller.abort();
    this.pendingAborts.clear();
  }

  /** Requests captured whose path matches, newest last. */
  callsMatching(matcher: PathMatcher): TransportRequest[] {
    return this.calls.filter((call) => matches(matcher, call));
  }

  headersOf(index: number): Record<string, string> {
    const call = this.calls[index];
    if (call === undefined) throw new Error(`FakeTransport: no captured call at index ${index}`);
    return { ...(call.headers ?? {}) };
  }

  idempotencyKeyOf(index: number): string | undefined {
    const headers = this.headersOf(index);
    const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'idempotency-key');
    return entry?.[1];
  }

  /** Times the recorded response for `key` was handed out again instead of re-running a handler. */
  replayCountFor(key: string): number {
    return this.idempotencyLog.get(key)?.hits ?? 0;
  }

  reset(): void {
    this.calls.length = 0;
    this.routes.length = 0;
    this.idempotencyLog.clear();
    this.replays.length = 0;
    this.hangAll = false;
    this.defaultLatencyMs = 0;
    this.pendingAborts = new Set();
  }

  async request<T>(req: TransportRequest): Promise<T> {
    const callIndex = this.calls.length;
    this.calls.push(req);

    if (this.hangAll) return new Promise<T>(() => undefined);

    const key = this.idempotencyKeyOf(callIndex);
    if (key !== undefined) {
      const record = this.idempotencyLog.get(key);
      if (record !== undefined) {
        const repeatedFingerprint = fingerprint(req.body);
        if (record.bodyFingerprint !== '<pre-seeded>' && record.bodyFingerprint !== repeatedFingerprint) {
          // Same key, different payload: the ledger's answer to that is a conflict, and a UI that
          // silently re-spends a key on new terms is the double-charge bug wearing a different hat.
          throw new ApiError({ kind: 'validation', httpStatus: 409 });
        }
        record.hits += 1;
        this.replays.push(key);
        if (record.errored) throw record.response;
        return record.response as T;
      }
    }

    const route = this.routes.find((candidate) => candidate.remaining > 0 && this.routeMatches(candidate, req));
    if (route === undefined) {
      throw new Error(
        `FakeTransport: unscripted ${req.method} ${req.path}. ` +
          `Routes loaded: ${this.routes.map((r) => `${r.method} ${describe(r.matcher)}`).join(' | ') || '(none)'}`,
      );
    }

    const started = Date.now();
    const outcome = route.handler(req, callIndex);
    const scripted = isScripted(outcome) ? outcome : ({ body: outcome } as ScriptedResponse);
    const latencyMs = scripted.latencyMs ?? this.defaultLatencyMs;

    const controller = new AbortController();
    this.pendingAborts.add(controller);
    const signal = controller.signal;
    const externalSignal = (req as TransportRequest & { signal?: AbortSignal }).signal;

    try {
      if (latencyMs > 0) await sleepWith(latencyMs, signal, externalSignal);
    } finally {
      this.pendingAborts.delete(controller);
    }

    const status = scripted.status ?? 200;
    if (status >= 400) {
      const error = apiErrorFromStatus(status, scripted.retryAfterMs === undefined ? null : String(scripted.retryAfterMs / 1000));
      if (key !== undefined) {
        this.idempotencyLog.set(key, {
          key,
          method: req.method,
          path: req.path,
          bodyFingerprint: fingerprint(req.body),
          response: error,
          errored: true,
          hits: 0,
        });
      }
      throw error;
    }

    const body = scripted.body;
    if (key !== undefined) {
      this.idempotencyLog.set(key, {
        key,
        method: req.method,
        path: req.path,
        bodyFingerprint: fingerprint(req.body),
        response: body,
        errored: false,
        hits: 0,
      });
    }
    route.remaining -= 1;
    void started;
    return body as T;
  }

  private routeMatches(route: Route, req: TransportRequest): boolean {
    if (route.method !== '*' && route.method !== req.method) return false;
    return matches(route.matcher, req);
  }
}

function isScripted(value: unknown): value is ScriptedResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('status' in value || 'body' in value || 'latencyMs' in value)
  );
}

function matches(matcher: PathMatcher, req: TransportRequest): boolean {
  if (typeof matcher === 'function') return matcher(req);
  if (matcher instanceof RegExp) return matcher.test(req.path);
  if (!matcher.includes('*')) return req.path === matcher;
  const pattern = matcher
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}$`).test(req.path);
}

function describe(matcher: PathMatcher): string {
  if (typeof matcher === 'function') return '(predicate)';
  if (matcher instanceof RegExp) return matcher.toString();
  return matcher;
}

/**
 * A body fingerprint good enough to tell "the same intent retried" from "a different request wearing
 * an old key". Key order is normalised because `JSON.stringify` of two objects built in different
 * orders is not equal, and that difference is meaningless to the ledger.
 */
export function fingerprint(body: unknown): string {
  if (body === undefined) return '<no-body>';
  return stableStringify(body);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
  return `{${entries.join(',')}}`;
}

function sleepWith(ms: number, internal: AbortSignal, external: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    function cleanup() {
      internal.removeEventListener('abort', abort);
      external?.removeEventListener('abort', abort);
    }
    if (external?.aborted) {
      abort();
      return;
    }
    if (internal.aborted) {
      abort();
      return;
    }
    internal.addEventListener('abort', abort);
    external?.addEventListener('abort', abort);
  });
}

/** `hasIdempotencyKey` re-exported so a suite can assert "this call was replay-safe" in one import. */
export { hasIdempotencyKey };
