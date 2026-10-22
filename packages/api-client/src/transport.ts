/**
 * The transport seam. Every client module talks to the backend only through `Transport`, so the
 * whole client is testable without network and the apps can inject an auth-refreshing (or
 * recording, or offline-caching) transport later without touching a call site.
 *
 * Paths are asserted, not live: ADR 0002 records that the PHP backend has no HTTP layer, so
 * nothing in this package may be described or displayed as "the API is up". A request that
 * reaches `fetchTransport` against a real base URL today will fail — that is the honest state.
 */

import { ApiError, apiErrorFromStatus, isApiError } from './errors.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface TransportRequest {
  readonly method: HttpMethod;
  /** Root-relative path, e.g. `/v1/listings/lst_42/manifest`. No query, no base. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface Transport {
  request<T>(req: TransportRequest): Promise<T>;
}

/** Conservative default: a buyer on a Johannesburg LTE connection should see `timeout` copy, not a spinner forever. */
export const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchTransportOptions {
  readonly baseUrl: string;
  /** Injectable for tests and for apps that wrap fetch with auth headers. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export function fetchTransport(options: FetchTransportOptions): Transport {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async request<T>(req: TransportRequest): Promise<T> {
      const url = buildUrl(baseUrl, req);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? timeoutMs);
      let response: Response;
      try {
        response = await doFetch(url, {
          method: req.method,
          headers: {
            accept: 'application/json',
            ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...toHeaders(req.headers),
          },
          ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
          signal: controller.signal,
        });
      } catch {
        // An abort of our own timer is a timeout; anything else (DNS, connection refused,
        // offline) is network. Neither may carry the cause's message forward: fetch error
        // strings embed the full URL, which for a signed-URL request is the secret itself.
        throw controller.signal.aborted
          ? new ApiError({ kind: 'timeout' })
          : new ApiError({ kind: 'network' });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        // `apiErrorFromStatus` deliberately never reads the body: an error response can echo
        // request material, and messages in this client are static per kind for that reason.
        throw apiErrorFromStatus(response.status, response.headers.get('retry-after'));
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
  };
}

function toHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  return headers ? { ...headers } : {};
}

function buildUrl(baseUrl: string, req: TransportRequest): string {
  const query = req.query;
  if (!query || Object.keys(query).length === 0) return `${baseUrl}${req.path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  return `${baseUrl}${req.path}?${params.toString()}`;
}

/**
 * Run one request through the transport with the client-side deadline enforced *here*, not in
 * fetchTransport, so the guarantee holds for every transport implementation — including the
 * deterministic fake in tests. A slow or hung server must produce a `timeout` ApiError, never
 * an unhandled rejection.
 */
export async function execute<T>(transport: Transport, req: TransportRequest): Promise<T> {
  const ms = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pending = transport.request<T>(req);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ApiError({ kind: 'timeout' })), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // If the transport promise rejects *after* we already timed out, its rejection still needs
    // an owner or the platform logs it as unhandled — the exact failure mode this client promises
    // not to have.
    pending.catch(() => {});
  }
}

export interface RetryOptions {
  /** Total attempts, retries included. Default 2: one blind retry, then surface the error. */
  readonly attempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const RETRY_BACKOFF_MS = 250;

/**
 * A blind retry is only ever safe when the request cannot duplicate work: a GET, or a mutation
 * that already carries an Idempotency-Key. Everything else propagates after the first failure
 * and lets the UI decide — this is the transport-level echo of the ledger's own rule that only
 * keyed requests are repeatable.
 */
export async function executeWithRetry<T>(
  transport: Transport,
  req: TransportRequest,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const sleep = options.sleep ?? defaultSleep;
  const keyed = hasIdempotencyKey(req);
  const replaySafe = req.method === 'GET' || keyed;

  for (let attempt = 1; ; attempt++) {
    try {
      return await execute<T>(transport, req);
    } catch (error) {
      const retriable =
        isApiError(error) &&
        (error.kind === 'network' || error.kind === 'timeout') &&
        replaySafe &&
        attempt < attempts;
      if (!retriable) throw error;
      if (error instanceof ApiError && error.retryAfterMs !== undefined) {
        await sleep(error.retryAfterMs);
      } else {
        await sleep(RETRY_BACKOFF_MS * attempt);
      }
    }
  }
}

export function hasIdempotencyKey(req: TransportRequest): boolean {
  return Object.entries(req.headers ?? {}).some(
    ([name]) => name.toLowerCase() === 'idempotency-key',
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-exported so modules that only need the status mapping do not import it from errors.js
// behind the app developer's back; keeps the seam documented in one place.
export { parseRetryAfter } from './errors.js';
