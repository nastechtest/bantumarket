import type { AuditStamp } from './audit-stamp.js';
import type { Capability } from './permissions.js';
import type { StaffRole } from './role.js';

export interface DeviceRecognition {
  readonly deviceId: string;
  readonly firstSeenAt: string;
  /** True means this browser signed in before — it is a fact about history, not a trust badge. */
  readonly recognised: boolean;
}

export interface ImpersonationSession {
  readonly operatorId: string;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly stamp: AuditStamp;
}

export interface StaffSession {
  readonly operatorId: string;
  readonly displayName: string;
  readonly role: StaffRole;
  /** Exactly what the server granted. Never derived from the route table. */
  readonly capabilities: readonly Capability[];
  readonly mfaSatisfied: boolean;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly device: DeviceRecognition;
  readonly impersonation: ImpersonationSession | null;
}

export type SessionRefusalCode =
  | 'not_signed_in'
  | 'mfa_required'
  | 'session_expired'
  | 'capability_missing'
  | 'impersonation_forbidden'
  | 'impersonation_expired';

export interface SessionRefusal {
  readonly code: SessionRefusalCode;
  readonly message: string;
}

export function sessionHasCapability(session: StaffSession, capability: Capability): boolean {
  return session.capabilities.includes(capability);
}

export function isSessionExpired(session: StaffSession, nowIso: string): boolean {
  return Date.parse(nowIso) >= Date.parse(session.expiresAt);
}

export function impersonationExpired(session: StaffSession, nowIso: string): boolean {
  if (session.impersonation === null) return false;
  return Date.parse(nowIso) >= Date.parse(session.impersonation.expiresAt);
}

export function isImpersonating(session: StaffSession, nowIso: string): boolean {
  return session.impersonation !== null && !impersonationExpired(session, nowIso);
}

/**
 * The single decision about whether the current session may perform an action. The UI calls this
 * to decide what to show; the server must call its own equivalent. Copy is deliberately thin:
 * a refusal never hints at whether a record exists.
 */
export function sessionRefusal(
  session: StaffSession | null,
  capability: Capability,
  nowIso: string,
  options: { readonly impersonationForbidden?: readonly Capability[] } = {},
): SessionRefusal | null {
  if (session === null) {
    return { code: 'not_signed_in', message: 'Sign in to use the console.' };
  }
  if (!session.mfaSatisfied) {
    return { code: 'mfa_required', message: 'This console requires a second factor before any action.' };
  }
  if (isSessionExpired(session, nowIso)) {
    return { code: 'session_expired', message: 'Your session ended. Sign in again.' };
  }
  if (session.impersonation !== null) {
    if (impersonationExpired(session, nowIso)) {
      return { code: 'impersonation_expired', message: 'The support session ended.' };
    }
    if (options.impersonationForbidden?.includes(capability)) {
      return {
        code: 'impersonation_forbidden',
        message: `Support sessions cannot perform ${capability}.`,
      };
    }
  }
  if (!sessionHasCapability(session, capability)) {
    return { code: 'capability_missing', message: 'Your role does not include this.' };
  }
  return null;
}

/** Remaining session milliseconds, clamped at zero. Used by the timeout banner. */
export function remainingSessionMs(session: StaffSession, nowIso: string): number {
  return Math.max(0, Date.parse(session.expiresAt) - Date.parse(nowIso));
}
