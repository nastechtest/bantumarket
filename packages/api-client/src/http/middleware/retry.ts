/**
 * The retry middleware, and the one rule it is not allowed to bend: a request that is not
 * replay-safe is never replayed.
 *
 * Why the rule is absolute rather than a default. `POST /checkout` with no key is a request to buy
 * a watch. If the connection drops on the way back, the client does not know whether the ledger
 * booked the order, and the only honest second attempt is one the server can recognise as the same
 * intent — the `Idempotency-Key` from `idempotency.ts`. `db/migrations/001_money_path.sql` makes
 * that recognition real for payouts (`idempotency_key text PRIMARY KEY`) and for provider callbacks
 * (`provider_events` unique on the event id), and `UniqueConstraintViolation` says idempotency "is
 * enforced by storage, not by remembering to check first". A blind replay of an unkeyed mutation is
 * the double order this package exists to prevent, so the ceiling on attempts for such a request is
 * one, whatever the caller asked for.
 *
 * The other half of the rule is which *failures* earn a replay. A ledger refusal
 * (`LEDGER_INTEGRITY_VIOLATION`, `STALE_ORDER_VERSION`, `HANDOVER_LOCKED`) is deterministic: the
 * books said no, and asking again is noise. A 503 or a dropped connection says nothing about the
 * books, and is worth one bounded retry with jittered, ceilinged backoff.
 */

import { isApiError } from '../../errors.js';
import { RequestAborted, abortReasonOf } from '../../abort.js';
import type { Middleware, MiddlewareContext, Next, RawResponse } from '../middleware.js';
import { isReplaySafe, withAttempt } from '../middleware.js';
import type { BackoffPolicy } from '../../ws/backoff.js';
import { computeDelayMs, withinBudget } from '../../ws/backoff.js';
import { clampRetryAfterMs, isLedgerRefusal, isRetryableStatus } from '../status-map.js';
import { isContractViolation, isHttpFailure } from '../errors.js';
import { requestHasIdempotencyKey } from '../headers.js';

export interface BlockedRetry {
  readonly path: string;
  readonly method: string;
  readonly requestedAttempts: number;
  readonly reason: 'not_replay_safe';
}

export interface RetryNotice {
  readonly path: string;
  readonly method: string;
  /** The attempt that just failed; the next one is `attempt + 1`. */
  readonly attempt: number;
  readonly delayMs: number;
  readonly cause: 'network' | 'timeout' | 'status';
  readonly status: number | undefined;
}

export interface RetryMiddlewareOptions {
  readonly backoff: BackoffPolicy;
  /** Called instead of retrying when a caller asked for retries on a request that cannot be replayed. */
  readonly onBlockedRetry?: (info: BlockedRetry) => void;
  readonly onRetry?: (info: RetryNotice) => void;
}

export function retryMiddleware(options: RetryMiddlewareOptions): Middleware {
  return async function retry(ctx: MiddlewareContext, next: Next): Promise<RawResponse> {
    const requested = ctx.request.attempts ?? ctx.policy.attempts;
    const replaySafe = isReplaySafe(ctx.request, requestHasIdempotencyKey(ctx.request));
    const budget = Math.max(1, replaySafe ? requested : 1);

    if (!replaySafe && requested > 1) {
      // Loud where it is observable, quiet where it is dangerous: the request still goes exactly
      // once, which is the safe outcome, and the caller learns its retry setting did not apply.
      options.onBlockedRetry?.({
        path: ctx.request.path,
        method: ctx.request.method,
        requestedAttempts: requested,
        reason: 'not_replay_safe',
      });
    }

    const startedAt = ctx.services.now();

    for (let attempt = 1; ; attempt++) {
      throwIfAlreadyAborted(ctx);
      try {
        return await next(withAttempt(ctx, attempt));
      } catch (error) {
        // A cancellation is not a failure and is never retried, whatever the policy says.
        if (error instanceof RequestAborted) throw error;
        if (isAborted(ctx)) throw abortNow(ctx);

        if (attempt >= budget) throw normalizeThrown(error);

        const cause = retriableCause(error, ctx);
        if (cause === undefined) throw normalizeThrown(error);

        const elapsedMs = ctx.services.now() - startedAt;
        const backoffDelay = computeDelayMs(options.backoff, attempt + 1, ctx.services.rng);
        const guided = clampRetryAfterMs(cause.retryAfterMs, ctx.policy.retryAfterCeilingMs);
        const delayMs = guided ?? backoffDelay;

        if (!withinBudget(options.backoff, elapsedMs, delayMs)) throw normalizeThrown(error);

        options.onRetry?.({
          path: ctx.request.path,
          method: ctx.request.method,
          attempt,
          delayMs,
          cause: cause.kind,
          status: cause.status,
        });

        await ctx.services.sleep(delayMs);
        // The wait is where a buyer taps back. Re-checking after it is the whole difference between
        // "the page changed" and "the request failed" in the numbers the pilot reads.
        if (isAborted(ctx)) throw abortNow(ctx);
      }
    }
  };
}

export interface RetriableCause {
  readonly kind: 'network' | 'timeout' | 'status';
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
}

/**
 * Whether this error justifies another attempt, given that replay safety was settled by the loop
 * above before the first request was even sent.
 */
export function retriableCause(error: unknown, ctx: MiddlewareContext): RetriableCause | undefined {
  if (isContractViolation(error)) return undefined;

  if (isApiError(error)) {
    // `network` and `timeout` prove nothing about the server's state. `rateLimited` is a wait, not
    // a failure, and is retried only when the policy opts into 429 (it is bounded by Retry-After).
    if (error.kind === 'network' || error.kind === 'timeout') {
      return { kind: error.kind, status: undefined, retryAfterMs: undefined };
    }
    if (error.kind === 'rateLimited' && ctx.policy.retryOnStatuses.includes(429)) {
      return { kind: 'status', status: 429, retryAfterMs: error.retryAfterMs };
    }
    return undefined;
  }

  if (isHttpFailure(error)) {
    if (isLedgerRefusal(error.code)) return undefined;
    if (!ctx.policy.retryOnStatuses.includes(error.status)) return undefined;
    if (!isRetryableStatus(error.status)) return undefined;
    return { kind: 'status', status: error.status, retryAfterMs: error.retryAfterMs };
  }

  return undefined;
}

/**
 * A function rather than an inline test: TypeScript keeps a `false` narrowing across an
 * `await` for a property access, which would make the post-sleep check look provably dead to the
 * compiler while being exactly the case that matters (the buyer navigating away during the backoff).
 */
function isAborted(ctx: MiddlewareContext): boolean {
  return ctx.scope.signal.aborted || ctx.request.signal?.aborted === true;
}

function throwIfAlreadyAborted(ctx: MiddlewareContext): void {
  if (isAborted(ctx)) throw abortNow(ctx);
}

function abortNow(ctx: MiddlewareContext): Error {
  const reason = abortReasonOf(ctx.request.signal) ?? abortReasonOf(ctx.scope.signal) ?? 'navigation';
  return new RequestAborted(reason, ctx.scope.id);
}

/**
 * A bare `AbortError` DOMException from a transport we do not own is a cancellation, not a failure;
 * it is translated so downstream handlers never see two shapes for the same event. Anything else
 * passes through untouched: wrapping a caller's TypeError as "could not reach NasTech" is how a
 * broken checkout gets blamed on the network.
 */
function normalizeThrown(error: unknown): unknown {
  if (error instanceof Error && error.name === 'AbortError') {
    return new RequestAborted('manual', 'transport');
  }
  return error;
}
