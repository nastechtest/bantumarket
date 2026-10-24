/**
 * Failure classification for console transports.
 *
 * The important line is the first one: 401, 403 and 404 collapse to the same `denied` outcome with
 * the same message. A UI that distinguishes "not allowed" from "not found" is an existence oracle —
 * a staff member can probe ids and learn which accounts or disputes exist. The server still returns
 * the truth over the wire; the console deliberately forgets the difference before rendering it.
 */

export type ConsoleFailureKind = 'denied' | 'error' | 'rate-limited' | 'offline';

export interface ConsoleFailure {
  readonly kind: ConsoleFailureKind;
  readonly status: number | null;
  readonly message: string;
  readonly retryAfterSeconds: number | null;
}

export const DENIED_MESSAGE =
  'Your role does not include this, or the record is not available to your account.';
export const ERROR_MESSAGE = 'The console could not complete that request. Nothing was changed.';
export const OFFLINE_MESSAGE = 'You are offline. Nothing was sent and no action was queued.';

/** Seconds form (`Retry-After: 120`) or HTTP-date form; both are legal on the wire. */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

export function classifyStatus(
  status: number,
  retryAfterHeader: string | null = null,
): ConsoleFailure {
  if (status === 401 || status === 403 || status === 404) {
    return { kind: 'denied', status, message: DENIED_MESSAGE, retryAfterSeconds: null };
  }
  if (status === 429) {
    const retryAfterSeconds = parseRetryAfter(retryAfterHeader);
    return {
      kind: 'rate-limited',
      status,
      message:
        retryAfterSeconds === null
          ? 'The console is receiving too many requests. Wait a moment and try again.'
          : `The console is receiving too many requests. Try again in ${retryAfterSeconds} seconds.`,
      retryAfterSeconds,
    };
  }
  return { kind: 'error', status, message: ERROR_MESSAGE, retryAfterSeconds: null };
}

export function offlineFailure(): ConsoleFailure {
  return { kind: 'offline', status: null, message: OFFLINE_MESSAGE, retryAfterSeconds: null };
}

export function isDenied(failure: ConsoleFailure): boolean {
  return failure.kind === 'denied';
}
