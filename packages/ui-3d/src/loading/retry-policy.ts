/**
 * Retry policy (07 §4.1 `loading/`).
 *
 * The rule that matters: a 4xx is an answer, not an accident. Retrying a 404 does not make the
 * asset appear, it makes the buyer wait longer for the same news, and on a metered connection it
 * charges them for the privilege. Only the transient half of the status space gets another attempt —
 * and when that budget runs out the buyer gets the static path, not a spinner.
 */

export interface RetryConfig {
  /** Total attempts, not retries: `maxAttempts: 3` means the first try plus two more. */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Injectable so the jitter is assertable instead of merely plausible. */
  readonly random: () => number;
}

export const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
  random: Math.random,
};

/** A missing manifest, a forbidden one and a malformed one are all final answers. */
export function isClientError(status: number): boolean {
  return status >= 400 && status <= 499;
}

export function isRetryableStatus(status: number): boolean {
  // 408 and 429 are 4xx codes that mean "later", which is exactly the case the ban on 4xx retries
  // was never about. Everything else in the 4xx band is refused outright.
  if (status === 408 || status === 429) return true;
  return status >= 500 && status <= 599;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

/** Network failures and timeouts are worth another attempt; a cancelled load is a decision, not a fault. */
export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) return false;
  return true;
}

/**
 * Exponential backoff with full jitter. `random() * capped` spreads a thundering herd of retries
 * across the whole window instead of synchronising them to the same second.
 */
export function backoffDelayMs(attempt: number, config: RetryConfig = DEFAULT_RETRY): number {
  const growth = config.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(config.maxDelayMs, growth);
  // A non-finite source of randomness collapses to no wait; it must never schedule NaN milliseconds.
  const drawn = config.random();
  const jitter = Number.isFinite(drawn) ? Math.min(Math.max(drawn, 0), 1) : 0;
  return Math.round(jitter * capped);
}

export type RetryOutcome =
  | { readonly retry: true; readonly attempt: number; readonly delayMs: number }
  | {
      readonly retry: false;
      readonly attempt: number;
      readonly reason: 'client-error' | 'not-retryable' | 'aborted' | 'attempts-exhausted';
      /** Every non-retryable stop hands the buyer the complete static path. */
      readonly staticPath: true;
    };

/**
 * `attempt` is the number of attempts already made. The caller must never see a bare "give up"
 * without also seeing `staticPath: true` — the hard stop is defined by what it hands over, not by
 * the fact that it stopped.
 */
export function nextRetry(
  attempt: number,
  result: { readonly status?: number; readonly error?: unknown },
  config: RetryConfig = DEFAULT_RETRY,
): RetryOutcome {
  const nextAttempt = attempt + 1;
  if (result.error !== undefined && !isRetryableError(result.error)) {
    return { retry: false, attempt, reason: 'aborted', staticPath: true };
  }
  if (typeof result.status === 'number') {
    if (isClientError(result.status) && !isRetryableStatus(result.status)) {
      return { retry: false, attempt, reason: 'client-error', staticPath: true };
    }
    if (!isRetryableStatus(result.status) && result.status >= 200 && result.status < 300) {
      // A success the caller routed here anyway: nothing to retry.
      return { retry: false, attempt, reason: 'client-error', staticPath: true };
    }
  }
  if (nextAttempt > config.maxAttempts) {
    return { retry: false, attempt, reason: 'attempts-exhausted', staticPath: true };
  }
  return { retry: true, attempt: nextAttempt, delayMs: backoffDelayMs(attempt, config) };
}
