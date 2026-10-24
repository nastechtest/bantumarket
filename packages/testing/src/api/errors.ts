import { ApiError, apiErrorFromStatus } from '@nastech/api-client';
import type { ApiErrorKind } from '@nastech/api-client';

/**
 * Named error scenarios for the fake transport, built on the client's OWN taxonomy.
 *
 * The reason this file exists at all: `packages/api-client/src/errors.ts` is the single authority for
 * what a failed request looks like to a component, and its messages are static per kind precisely so
 * nothing from a response body can reach the screen (a failed signed-URL fetch returns the secret in
 * its body). A harness that invented its own `FakeApiError` class would give every app a second
 * error shape to handle, and `isApiError()` would return false on it — the fake would then be the
 * thing that made a production bug impossible to reproduce. So: no new class, no new copy, no new
 * status mapping. Just constructors for the five shapes the marketplace actually sees.
 */

/** 401 — session expired mid-checkout, the case that must never lose the cart. */
export function unauthorized(): ApiError {
  return apiErrorFromStatus(401);
}

/** 403 — right user, wrong order. Distinct from 401 because the fix is not "sign in again". */
export function forbidden(): ApiError {
  return apiErrorFromStatus(403);
}

/** 404 — listing withdrawn while the buyer was reading it. */
export function notFound(): ApiError {
  return apiErrorFromStatus(404);
}

/**
 * 422/409/any 4xx that is not a permission problem — the ledger's `StaleOrderVersion` arrives as 409
 * and maps to `validation` (see errors.ts), which is what "your form holds an old view" means to a UI.
 */
export function validation(status = 422): ApiError {
  return apiErrorFromStatus(status);
}

/** 429 with the server's guidance, in ms. `retryAfterMs` is what a countdown reads. */
export function rateLimited(retryAfterMs?: number): ApiError {
  const error = apiErrorFromStatus(429, retryAfterMs === undefined ? null : String(Math.round(retryAfterMs / 1000)));
  return error;
}

/** 500/502/503/504 — the payment provider or the API is down; copy promises nothing about server state. */
export function providerUnavailable(status = 503): ApiError {
  return apiErrorFromStatus(status);
}

/** The client-side deadline fired. Nothing changed server-side, and the copy says so. */
export function timeout(): ApiError {
  return new ApiError({ kind: 'timeout' });
}

/** Offline / DNS / connection refused. */
export function network(): ApiError {
  return new ApiError({ kind: 'network' });
}

/** Any kind by name, for a table-driven suite that wants to enumerate the taxonomy. */
export function errorForKind(kind: ApiErrorKind): ApiError {
  switch (kind) {
    case 'unauthorized':
      return unauthorized();
    case 'forbidden':
      return forbidden();
    case 'notFound':
      return notFound();
    case 'validation':
      return validation();
    case 'rateLimited':
      return rateLimited();
    case 'providerUnavailable':
      return providerUnavailable();
    case 'timeout':
      return timeout();
    case 'network':
      return network();
  }
}

/** The complete kind vocabulary, so a suite can prove it handled all of them without listing them. */
export const ALL_API_ERROR_KINDS: readonly ApiErrorKind[] = [
  'unauthorized',
  'forbidden',
  'notFound',
  'validation',
  'rateLimited',
  'network',
  'timeout',
  'providerUnavailable',
];

/**
 * An `AbortError` in the shape `fetch` produces: `name`, not `instanceof` — which is why
 * `isAbortError()` exists rather than a class check. Bun, jsdom and Chrome do not share one
 * AbortError constructor, so the only portable test is the name plus the aborted signal.
 */
export function abortError(message = 'The operation was aborted.'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}
