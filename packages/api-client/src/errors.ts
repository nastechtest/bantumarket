/**
 * The closed error taxonomy for the browser client.
 *
 * There is no HTTP server yet (ADR 0002): the PHP backend has no HTTP layer, so every mapping
 * here is asserted against conventional status codes, not observed traffic. When the layer lands,
 * this file is the place that must be re-checked, not the call sites — components only ever see
 * `ApiError.kind`, never a raw status.
 */

export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'validation'
  | 'rateLimited'
  | 'network'
  | 'timeout'
  | 'providerUnavailable';

/**
 * Static, human-safe copy per kind. A message is built exclusively from this table (plus a
 * request path), never from a response body or a URL: a failed signed-URL fetch returns the
 * secret in its body, and interpolating it here is how the secret ends up in a React error
 * boundary, a log line, or a telemetry payload.
 */
const SAFE_MESSAGES: Readonly<Record<ApiErrorKind, string>> = {
  unauthorized: 'You need to sign in to continue.',
  forbidden: 'You do not have access to this.',
  notFound: 'We could not find this.',
  validation: 'Some of the details you entered need to be fixed.',
  rateLimited: 'Too many requests — please wait a moment and try again.',
  network: 'We could not reach NasTech. Check your connection and try again.',
  timeout: 'NasTech took too long to respond. Nothing has been changed — try again.',
  providerUnavailable:
    'The payment provider is not responding. Your payment did not go through and nothing was charged — try again.',
};

const RETRYABLE_KINDS: ReadonlySet<ApiErrorKind> = new Set([
  'network',
  'timeout',
  'rateLimited',
  'providerUnavailable',
]);

export interface ApiErrorInit {
  readonly kind: ApiErrorKind;
  /** HTTP status for telemetry only. Never read by a component — render `kind`/`message`. */
  readonly httpStatus?: number;
  /** Wait duration for a 429, in ms. Absent means "no server guidance". */
  readonly retryAfterMs?: number;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly httpStatus: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly retryable: boolean;

  constructor(init: ApiErrorInit) {
    super(SAFE_MESSAGES[init.kind]);
    this.name = 'ApiError';
    this.kind = init.kind;
    // `?? undefined` under exactOptionalPropertyTypes: absent means absent, not 0.
    this.httpStatus = init.httpStatus ?? undefined;
    this.retryAfterMs = init.retryAfterMs ?? undefined;
    this.retryable = RETRYABLE_KINDS.has(init.kind);
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * Status → kind. 409 maps to `validation` because the ledger's only 409 today is
 * `StaleOrderVersion` — "your form is holding an out-of-date view of the order", which the UI
 * handles like a validation failure (reload, re-present), not like a permission problem.
 * Every 5xx maps to `providerUnavailable`, the one kind whose copy promises nothing about
 * what happened server-side, which is exactly what a 500 with money in flight deserves.
 */
export function errorKindFromStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'providerUnavailable';
  return 'validation';
}

export function apiErrorFromStatus(status: number, retryAfterHeader?: string | null): ApiError {
  const kind = errorKindFromStatus(status);
  const retryAfterMs = kind === 'rateLimited' ? parseRetryAfter(retryAfterHeader ?? undefined) : undefined;
  // Conditional spread: exactOptionalPropertyTypes means "no guidance" is an absent key,
  // not a key set to undefined.
  return new ApiError({ kind, httpStatus: status, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });
}

/**
 * Retry-After is either delta-seconds or an HTTP-date. Both are legal; neither is trusted —
 * a negative or unparseable value means "no guidance", not "retry immediately at -5s".
 */
export function parseRetryAfter(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return seconds < 0 ? undefined : Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  const delta = dateMs - Date.now();
  return delta < 0 ? 0 : delta;
}
