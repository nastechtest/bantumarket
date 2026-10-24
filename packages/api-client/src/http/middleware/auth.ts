/**
 * Authentication: attach a bearer token, and refresh at most once per logical request.
 *
 * PROVENANCE AND ASSUMPTION. `nastech-market-php/README.md` §"Not built yet" is blunt: "No identity,
 * no authn, no authorisation. `buyer_id` and `seller_id` are strings a test supplies." There is no
 * login endpoint, no session and no refresh route to code against, so this middleware owns the
 * *shape* of the problem and delegates the credential entirely to an injected `AuthGateway`, which
 * the auth feature (brief 17) implements. Nothing here invents a `/v1/session` path — the gateway
 * gets its token however it is built.
 *
 * The replay rule is the one worth reading twice. A 401 means the request was refused before it did
 * any work, which tempts a client into replaying a mutation unconditionally. This one does not: an
 * unkeyed mutation is never replayed, exactly as in `retry.ts`, because the property the pilot needs
 * is "a mutation without an idempotency key is sent once per intent", and a middleware that breaks
 * the rule for a good reason is how the rule stops being testable. The UI receives the 401, the
 * session refreshes for next time, and the buyer's next deliberate tap is a new intent with a new
 * key.
 *
 * The token is never logged. `headers.ts` redacts `authorization` (and anything whose name contains
 * token/secret/signature) before a value can reach a support field, so there is no path from
 * "attach the headers" to "attach somebody's session".
 */

import { ApiError } from '../../errors.js';
import type { Middleware, MiddlewareContext, Next, RawResponse } from '../middleware.js';
import { isReplaySafe, withRequest } from '../middleware.js';
import { AUTHORIZATION_HEADER, requestHasIdempotencyKey, setHeader } from '../headers.js';
import { isHttpFailure } from '../errors.js';

export interface AuthGateway {
  /** The current access token, or `null` when nobody is signed in. Must not throw for a guest. */
  accessToken(): Promise<string | null>;
  /**
   * Exchange the refresh credential for a new access token. Returns `null` when the session is
   * genuinely gone — a network failure must be reported as such, not as "signed out", or a buyer
   * loses a cart to a Vodacom dropout.
   */
  refresh(): Promise<string | null>;
  /** Called when a refresh definitively failed, so the app can route to sign-in. */
  onSessionLost?(info: { readonly path: string; readonly method: string }): void;
}

export interface AuthMiddlewareOptions {
  readonly gateway: AuthGateway | undefined;
  /**
   * When true (default) a request with no session is still sent, unauthenticated. The pilot has
   * public browse, and a client that refuses guest requests would break the first-paint path.
   */
  readonly allowAnonymous?: boolean;
  readonly onReplayBlocked?: (info: {
    readonly path: string;
    readonly method: string;
    readonly reason: 'not_replay_safe';
  }) => void;
}

export function authMiddleware(options: AuthMiddlewareOptions): Middleware {
  // One refresh shared by every concurrent request. Without this, four components that all mount
  // into an expired session fire four refreshes, and a rolling-refresh provider invalidates the
  // token on the second one — the classic "signed out at random" bug.
  let refreshInFlight: Promise<string | null> | undefined;

  const gateway = options.gateway;

  const singleFlightRefresh = (): Promise<string | null> => {
    if (gateway === undefined) return Promise.resolve(null);
    if (refreshInFlight !== undefined) return refreshInFlight;
    refreshInFlight = gateway.refresh().finally(() => {
      refreshInFlight = undefined;
    });
    return refreshInFlight;
  };

  return async function auth(ctx: MiddlewareContext, next: Next): Promise<RawResponse> {
    if (gateway === undefined) return await next(ctx);

    const token = await gateway.accessToken();
    if (token === null) {
      if (options.allowAnonymous !== false) return await next(ctx);
      throw new ApiError({ kind: 'unauthorized' });
    }

    const withToken = (value: string): MiddlewareContext =>
      withRequest(ctx, { headers: setHeader(ctx.request.headers, AUTHORIZATION_HEADER, `Bearer ${value}`) });

    try {
      return await next(withToken(token));
    } catch (error) {
      if (!isUnauthorized(error)) throw error;

      const fresh = await singleFlightRefresh();
      if (fresh === null) {
        gateway.onSessionLost?.({ path: ctx.request.path, method: ctx.request.method });
        throw error;
      }

      if (!isReplaySafe(ctx.request, requestHasIdempotencyKey(ctx.request))) {
        options.onReplayBlocked?.({
          path: ctx.request.path,
          method: ctx.request.method,
          reason: 'not_replay_safe',
        });
        throw error;
      }

      // Downstream of this point the retry middleware re-runs, so a refreshed replay is a fresh
      // attempt sequence with a fresh per-attempt request id — and the same idempotency key, which
      // is the only reason the server can tell the two apart from a duplicate.
      return await next(withToken(fresh));
    }
  };
}

function isUnauthorized(error: unknown): boolean {
  return isHttpFailure(error) && error.status === 401;
}
