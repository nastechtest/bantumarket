/**
 * The client-side deadline, enforced here rather than inside `fetchTransport`.
 *
 * `transport.ts` already makes this argument for wave A's `execute()`: a deadline guaranteed only by
 * the browser fetch implementation is not a guarantee for the deterministic fake, and the fake is
 * where the behaviour gets proven. Same rule here — the deadline is a middleware, so it applies to
 * every terminal, including a recording transport or an offline cache.
 *
 * What the deadline must not do is impersonate a cancellation. A timer firing is a `timeout`
 * `ApiError` with the copy "nothing has been changed — try again"; a scope cancelled because the
 * buyer navigated is a `RequestAborted` that never reaches a failure counter. The two are different
 * events with different numbers attached to them, and collapsing them is how an error budget fills
 * up with people leaving pages.
 */

import { ApiError } from '../../errors.js';
import { RequestAborted, abortReasonOf, withDeadline } from '../../abort.js';
import type { Middleware, MiddlewareContext, Next, RawResponse } from '../middleware.js';
import { withRequest } from '../middleware.js';

export function timeoutsMiddleware(): Middleware {
  return async function timeouts(ctx: MiddlewareContext, next: Next): Promise<RawResponse> {
    const timeoutMs = ctx.request.timeoutMs ?? ctx.policy.timeoutMs;
    const caller = ctx.request.signal ?? ctx.scope.signal;

    if (caller !== undefined && caller.aborted) {
      // Zero requests sent: a page that is already gone must not touch the network on the way out.
      throw new RequestAborted(abortReasonOf(caller) ?? 'navigation', ctx.scope.id);
    }

    const deadline = withDeadline(caller, timeoutMs);
    const scoped = withRequest(ctx, { signal: deadline.signal });

    try {
      return await next(scoped);
    } catch (error) {
      if (error instanceof RequestAborted) throw error;

      if (deadline.timedOut()) throw new ApiError({ kind: 'timeout' });

      if (error instanceof Error && error.name === 'AbortError') {
        // A terminal that aborted without consulting our marker: classify from the signal itself,
        // which `withDeadline` stamped with the reason that actually applied.
        const reason = abortReasonOf(deadline.signal);
        if (reason === 'timeout') throw new ApiError({ kind: 'timeout' });
        throw new RequestAborted(reason ?? 'manual', ctx.scope.id);
      }

      throw error;
    } finally {
      deadline.release();
    }
  };
}
