import type { RouteDef } from '../router.js';
import { internalPath, SIGN_IN_PATH, signInHref } from '../lib/navigate.js';
import type { SellerSessionState } from '../lib/session.js';

/**
 * Route classes, not paths, decide access:
 *  - `critical` (money and credentials) needs a confirmed seller session. Anonymous bounces to
 *    sign-in carrying the blocked destination; "checking" holds the screen rather than guessing.
 *  - `app` and `scene` routes are not gated here. A scene is a route, so its failure must not
 *    turn into a sign-in problem.
 *
 * `/sign-in` is itself `critical`; gating it would produce a redirect loop, so it is the one
 * explicit exception and it is tested.
 */

export type GuardDecision =
  | {
      readonly kind: 'allow';
      readonly reason: 'public-route' | 'session-present' | 'sign-in-entry';
    }
  | {
      readonly kind: 'hold';
      readonly reason: 'checking-session';
    }
  | {
      readonly kind: 'redirect';
      readonly reason: 'session-required';
      readonly to: string;
      readonly returnTo: string;
    };

export function guardRoute(
  route: RouteDef,
  session: SellerSessionState,
  currentPath: string = '/',
): GuardDecision {
  if (route.path === SIGN_IN_PATH) {
    return { kind: 'allow', reason: 'sign-in-entry' };
  }

  if (route.class !== 'critical') {
    return { kind: 'allow', reason: 'public-route' };
  }

  if (session.status === 'authenticated') {
    return { kind: 'allow', reason: 'session-present' };
  }

  if (session.status === 'checking') {
    return { kind: 'hold', reason: 'checking-session' };
  }

  const returnTo = internalPath(currentPath, '/');
  return {
    kind: 'redirect',
    reason: 'session-required',
    to: signInHref(returnTo),
    returnTo,
  };
}
