import type { ReactNode } from 'react';
import type { Capability } from './permissions.js';
import { capabilityForPath, decidePath } from './permissions.js';
import type { StaffSession } from './session.js';
import { impersonationExpired, isSessionExpired } from './session.js';
import { PermissionPanel, MfaRequiredPanel, SessionEndedPanel, SignInRequiredPanel } from './ui.js';

/**
 * The same gate is used by every family of screens, so the refused rendering cannot drift: sign-in
 * first, then the session's own expiry, then the route's capability, then impersonation. Order
 * matters — an expired impersonation must not render a permission panel that implies the action
 * merely needs a grant.
 */
export function RequireCapability({
  session,
  capability,
  now,
  children,
}: {
  session: StaffSession | null;
  capability: Capability;
  now: string;
  children: ReactNode;
}) {
  if (session === null) return <SignInRequiredPanel />;
  if (!session.mfaSatisfied) return <MfaRequiredPanel />;
  if (isSessionExpired(session, now)) return <SessionEndedPanel impersonating={session.impersonation !== null} />;
  if (session.impersonation !== null && impersonationExpired(session, now)) return <SessionEndedPanel impersonating />;
  if (!session.capabilities.includes(capability)) return <PermissionPanel capability={capability} />;
  return <>{children}</>;
}

export function RouteGate({
  session,
  pathname,
  now,
  children,
}: {
  session: StaffSession | null;
  pathname: string;
  now: string;
  children: ReactNode;
}) {
  if (session === null) return <SignInRequiredPanel />;
  if (!session.mfaSatisfied) return <MfaRequiredPanel />;
  if (isSessionExpired(session, now)) return <SessionEndedPanel impersonating={session.impersonation !== null} />;
  if (session.impersonation !== null && impersonationExpired(session, now)) return <SessionEndedPanel impersonating />;
  const decision = decidePath(session, pathname);
  if (decision.allowed) return <>{children}</>;
  const capability = decision.capability ?? capabilityForPath(pathname) ?? 'queue.view';
  return <PermissionPanel capability={capability} />;
}
