import type { RouteDef } from '../router.js';
import type { StaffSession } from '../shell/session.js';
import { impersonationExpired, isImpersonating, isSessionExpired } from '../shell/session.js';
import { decidePath } from '../shell/permissions.js';
import { isNavPath } from './route-policy.js';

/**
 * The one place navigation visibility is decided.
 *
 * Hiding an entry is courtesy, never authorisation: the same capability is checked again by the
 * server on every request, and the frame refuses the page as well as the link. That is why this
 * function composes the session gate with `decidePath` instead of re-reading `capabilities` in a
 * component — a second reader is how a rail and a page start disagreeing.
 *
 * A `critical` route is not visible while a support session is impersonating, regardless of the
 * capability list; the denial is enforced in `nav/access.ts` too.
 */
export function canSee(
  route: RouteDef,
  session: StaffSession | null,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (session === null) return false;
  if (!isNavPath(route.path)) return false;
  if (isSessionExpired(session, nowIso)) return false;
  if (!session.mfaSatisfied) return false;
  if (session.impersonation !== null && impersonationExpired(session, nowIso)) return false;
  if (route.class === 'critical' && isImpersonating(session, nowIso)) return false;
  return decidePath(session, route.path).allowed;
}
