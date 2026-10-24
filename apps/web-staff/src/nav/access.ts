import type { RouteDef } from '../router.js';
import type { StaffSession } from '../shell/session.js';
import { impersonationExpired, isImpersonating, isSessionExpired } from '../shell/session.js';
import { decidePath } from '../shell/permissions.js';

export type AccessDenialReason =
  | 'signed-out'
  | 'mfa-required'
  | 'session-expired'
  | 'impersonation-ended'
  | 'impersonation-blocked'
  | 'missing-capability';

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AccessDenialReason };

export const ACCESS_ALLOWED: AccessDecision = { allowed: true };

function denied(reason: AccessDenialReason): AccessDecision {
  return { allowed: false, reason };
}

/**
 * The frame's answer for a whole page, as opposed to a single control. It layers the session's own
 * state (signed out, second factor, expiry, impersonation expiry) over the route capability check.
 *
 * `/sign-in` is the one route an anonymous visitor may render — otherwise there is no way in. An
 * active impersonating session is refused it, because `/sign-in` is a credential surface and a
 * support session must not touch one.
 *
 * The impersonation refusal is driven by the route *class*, not a list of paths: a future `critical`
 * route is refused without anyone remembering to add it to a blocklist.
 */
export function decideAccess(
  route: RouteDef,
  session: StaffSession | null,
  nowIso: string = new Date().toISOString(),
): AccessDecision {
  if (route.path === '/sign-in') {
    if (session !== null && isImpersonating(session, nowIso)) return denied('impersonation-blocked');
    return ACCESS_ALLOWED;
  }
  if (session === null) return denied('signed-out');
  if (isSessionExpired(session, nowIso)) return denied('session-expired');
  if (!session.mfaSatisfied) return denied('mfa-required');
  if (session.impersonation !== null && impersonationExpired(session, nowIso)) {
    return denied('impersonation-ended');
  }
  if (route.path === '*') return ACCESS_ALLOWED;
  if (route.class === 'critical' && isImpersonating(session, nowIso)) {
    return denied('impersonation-blocked');
  }

  const decision = decidePath(session, route.path);
  if (decision.allowed) return ACCESS_ALLOWED;
  if (decision.code === 'impersonation_blocked') return denied('impersonation-blocked');
  if (decision.code === 'no_session') return denied('signed-out');
  // `unknown_route` fails closed as a capability refusal: a route the policy does not know is not a
  // route this session is entitled to, and inventing a distinct message would describe the console's
  // routing table to the visitor.
  return denied('missing-capability');
}
