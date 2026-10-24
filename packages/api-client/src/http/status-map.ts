/**
 * Status codes and domain error codes, read off the PHP ledger rather than invented.
 *
 * PROVENANCE, because this is the file the controller has to re-verify the day a router exists.
 * `nastech-market-php/README.md` §"Not built yet" is explicit: "No HTTP layer. No router, no
 * controllers, no JSON, no status codes." What *is* real is the exception vocabulary the handlers
 * throw, and the README's note that `WebhookRejected` exists so the future HTTP layer has a 4xx to
 * map. So the codes below are derived from those classes — `Orders/StaleOrderVersion.php`,
 * `SharedKernel/IllegalTransition.php`, `Handover/HandoverRejected.php`,
 * `Payments/WebhookRejected.php`, `Settlements/PayoutRejected.php`,
 * `Settlements/LedgerIntegrityViolation.php`, `Commissions/CommissionIntegrityViolation.php`,
 * `SharedKernel/Persistence/UniqueConstraintViolation.php` — and from the column CHECKs and state
 * names in `db/migrations/001_money_path.sql`. A future router may rename a code string; when it
 * does, this table is the only file that changes.
 *
 * Two rules that come from the ledger itself rather than from taste:
 *   - an integrity violation is never retryable. `MoneyInvariants` refuses a row that would break
 *     a balance; resending the request does not make the arithmetic truer, and a client that
 *     retries it is asking the ledger to be beaten repeatedly.
 *   - a 5xx in the money path may not promise anything about what happened. `errors.js` chose
 *     `providerUnavailable` for exactly that reason and this file keeps that choice.
 */

import { errorKindFromStatus } from '../errors.js';
import type { ApiErrorKind } from '../errors.js';

export type DomainErrorCode =
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'STALE_ORDER_VERSION'
  | 'ILLEGAL_TRANSITION'
  | 'HANDOVER_REJECTED'
  | 'HANDOVER_LOCKED'
  | 'HANDOVER_WINDOW_CLOSED'
  | 'TOKEN_REVOKED'
  | 'PAYOUT_REJECTED'
  | 'LEDGER_INTEGRITY_VIOLATION'
  | 'COMMISSION_INTEGRITY_VIOLATION'
  | 'UNIQUE_CONSTRAINT_VIOLATION'
  | 'WEBHOOK_REJECTED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONFLICT'
  | 'UNMAPPED_DOMAIN_CODE';

/**
 * `PaymentRecordingResult` has three honest outcomes and none of them is an HTTP error: a
 * duplicate is the idempotency working, and a discrepancy is a human-owned record the server
 * returns as 200 so the provider stops retrying. A client that treats `discrepancy` as a failure
 * would show a buyer a "payment failed" line on a payment that was booked.
 */
export const PAYMENT_RECORDING_STATUSES = ['accepted', 'duplicate', 'discrepancy'] as const;
export type PaymentRecordingStatus = (typeof PAYMENT_RECORDING_STATUSES)[number];

export function isPaymentRecordingStatus(value: unknown): value is PaymentRecordingStatus {
  return typeof value === 'string' && (PAYMENT_RECORDING_STATUSES as readonly string[]).includes(value);
}

/**
 * Codes that mean "the ledger refused on purpose". Retrying them is not a transient failure, and
 * for the two integrity ones a retry would be a request to violate the same invariant again.
 */
const LEDGER_REFUSAL: ReadonlySet<DomainErrorCode> = new Set([
  'LEDGER_INTEGRITY_VIOLATION',
  'COMMISSION_INTEGRITY_VIOLATION',
  'STALE_ORDER_VERSION',
  'ILLEGAL_TRANSITION',
  'HANDOVER_LOCKED',
  'HANDOVER_WINDOW_CLOSED',
  'TOKEN_REVOKED',
  'UNIQUE_CONSTRAINT_VIOLATION',
  'IDEMPOTENCY_KEY_REUSED',
  'PAYOUT_REJECTED',
  'VALIDATION_FAILED',
  'WEBHOOK_REJECTED',
]);

const TRANSPORT_STATUSES: readonly number[] = [408, 429, 500, 502, 503, 504, 507];

/** Default code when the body carries none: derived from the status, never guessed at a domain. */
export function codeForStatus(status: number): DomainErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 404) return 'RESOURCE_NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 410) return 'RESOURCE_NOT_FOUND';
  if (status === 422) return 'VALIDATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'PROVIDER_UNAVAILABLE';
  return 'UNMAPPED_DOMAIN_CODE';
}

export function isKnownDomainCode(value: unknown): value is DomainErrorCode {
  return typeof value === 'string' && DOMAIN_ERROR_CODES.includes(value as DomainErrorCode);
}

/** Every code this file claims knowledge of, in the order a support report should list them. */
export const DOMAIN_ERROR_CODES: readonly DomainErrorCode[] = [
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'RESOURCE_NOT_FOUND',
  'VALIDATION_FAILED',
  'STALE_ORDER_VERSION',
  'ILLEGAL_TRANSITION',
  'HANDOVER_REJECTED',
  'HANDOVER_LOCKED',
  'HANDOVER_WINDOW_CLOSED',
  'TOKEN_REVOKED',
  'PAYOUT_REJECTED',
  'LEDGER_INTEGRITY_VIOLATION',
  'COMMISSION_INTEGRITY_VIOLATION',
  'UNIQUE_CONSTRAINT_VIOLATION',
  'WEBHOOK_REJECTED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'CONFLICT',
  'UNMAPPED_DOMAIN_CODE',
];

/**
 * Code-first classification, status as the fallback. The fallback deliberately delegates to
 * `errorKindFromStatus` in errors.js so there is exactly one answer to "what does a 4xx that is
 * not 401/403/404/429 mean", and an unmapped server code cannot invent a second one.
 */
export function apiErrorKindFor(status: number, code?: DomainErrorCode | string): ApiErrorKind {
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'WEBHOOK_REJECTED':
      return 'unauthorized';
    case 'PERMISSION_DENIED':
      return 'forbidden';
    case 'RESOURCE_NOT_FOUND':
      return 'notFound';
    case 'RATE_LIMITED':
      return 'rateLimited';
    case 'PROVIDER_UNAVAILABLE':
      return 'providerUnavailable';
    case 'LEDGER_INTEGRITY_VIOLATION':
    case 'COMMISSION_INTEGRITY_VIOLATION':
    case 'UNIQUE_CONSTRAINT_VIOLATION':
      // A server-side refusal to keep the books straight. `providerUnavailable` is the only kind
      // whose copy promises nothing about the outcome, which is precisely what this deserves.
      return 'providerUnavailable';
    default:
      return errorKindFromStatus(status);
  }
}

/**
 * Whether the *status* alone makes a replay worth considering. 500 is in the list only for GETs
 * and is filtered again by `isRetryableFailure` for the codes that mean a ledger refusal.
 */
export function isRetryableStatus(status: number): boolean {
  return TRANSPORT_STATUSES.includes(status);
}

export function isLedgerRefusal(code: DomainErrorCode | undefined): boolean {
  return code !== undefined && LEDGER_REFUSAL.has(code);
}

/**
 * A 429/503 that says "come back in N" is guidance, and guidance is followed rather than
 * second-guessed — but only up to the client's own ceiling, because a server that answers
 * `Retry-After: 3600` to a search request must not park a spinner for an hour.
 */
export function clampRetryAfterMs(retryAfterMs: number | undefined, ceilingMs: number): number | undefined {
  if (retryAfterMs === undefined) return undefined;
  if (!Number.isFinite(retryAfterMs)) return undefined;
  return Math.max(0, Math.min(retryAfterMs, ceilingMs));
}
