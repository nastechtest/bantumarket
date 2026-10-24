/**
 * Request identity: one id per attempt, one correlation id per logical request.
 *
 * The split matters at 22:00 when a seller says "the app ate my order". Two attempts of the same
 * `POST /v1/orders` share a correlation id, so a support agent greps one value and sees both the
 * timed-out first attempt and the key-matched replay. Two attempts of the same request sharing a
 * *request* id would instead look like the client firing twice on its own, which is a different
 * investigation and a different answer.
 *
 * The correlation id is minted by `client.ts` before the chain runs, not here, because this
 * middleware sits downstream of the retry loop and re-runs on every attempt. Anything generated
 * inside it is per-attempt by construction — which is exactly what `x-request-id` should be.
 */

import type { Middleware, MiddlewareContext, Next, RawResponse } from '../middleware.js';
import { withRequest } from '../middleware.js';
import { REQUEST_ID_HEADER, setHeader } from '../headers.js';

export interface RequestIdOptions {
  /** Injectable for tests; defaults to the UUID generator already used for idempotency keys. */
  readonly generate?: () => string;
  /** Header carrying the attempt number, so a server can log it without parsing the id. */
  readonly announceAttempts?: boolean;
}

export function requestIdMiddleware(options: RequestIdOptions = {}): Middleware {
  const generate = options.generate ?? defaultId;
  return async function requestId(ctx: MiddlewareContext, next: Next): Promise<RawResponse> {
    const attempt = ctx.attempt;
    let headers = setHeader(ctx.request.headers, REQUEST_ID_HEADER, `${generate()}-${attempt}`);
    if (options.announceAttempts !== false) {
      headers = setHeader(headers, 'x-request-attempt', String(attempt));
    }
    return await next(withRequest(ctx, { headers }));
  };
}

/**
 * A sortable, comparable, unguessable-enough id. `crypto.randomUUID` is the browser's own answer and
 * is what `idempotency.ts` uses; the fallback keeps the shape stable on a non-secure context, where
 * `randomUUID` is not exposed at all.
 */
export function defaultId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();
  return `rid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
