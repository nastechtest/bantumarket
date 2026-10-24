import type { AuditStamp } from '../../../shell/audit-stamp.js';
import type { Capability } from '../../../shell/permissions.js';
import { roleBaseline } from '../../../shell/permissions.js';
import type { ImpersonationSession, StaffSession } from '../../../shell/session.js';
import { fixtureSession, FIXTURE_NOW } from '../../../shell/api/fixtures.js';
import type { MfaRequest, SignInRequest, SignInResult, StaffAuthTransport } from './staff-auth-transport.js';
import { AuthRefusal } from './staff-auth-transport.js';

export const FIXTURE_MFA_CODE = '418205';
export const FIXTURE_PASSWORD = 'pilot-console';

export interface AuthFixtureOptions {
  readonly operator?: StaffSession;
  readonly mfaCode?: string;
  /** Simulates the bug the UI must refuse: a transport that signs in without a second factor. */
  readonly signInWithoutMfa?: boolean;
  readonly delayMs?: number;
}

export interface AuthFixture extends StaffAuthTransport {
  readonly calls: string[];
  readonly audit: AuditStamp[];
  readonly session: () => StaffSession | null;
}

export function createAuthFixture(options: AuthFixtureOptions = {}): AuthFixture {
  const operator = options.operator ?? fixtureSession({ role: 'admin', capabilities: [...roleBaseline('admin')] });
  const code = options.mfaCode ?? FIXTURE_MFA_CODE;
  const calls: string[] = [];
  const audit: AuditStamp[] = [];
  let current: StaffSession | null = null;
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, options.delayMs ?? 0));

  return {
    calls,
    audit,
    session: () => current,
    async beginSignIn(request: SignInRequest): Promise<SignInResult> {
      calls.push('beginSignIn');
      await wait();
      if (request.email !== 'staff@nastech.test' || request.password !== FIXTURE_PASSWORD) {
        return { stage: 'refused', refusal: 'Sign-in was refused.' };
      }
      if (options.signInWithoutMfa) {
        current = operator;
        return {
          stage: 'signed_in',
          session: { ...operator, mfaSatisfied: false },
          deviceRecognised: true,
        };
      }
      return { stage: 'mfa_required', challengeId: 'chal_pilot_1', deviceRecognised: true };
    },
    async verifyMfa(request: MfaRequest): Promise<SignInResult> {
      calls.push('verifyMfa');
      await wait();
      if (request.challengeId !== 'chal_pilot_1' || request.code !== code) {
        return { stage: 'refused', refusal: 'That code was not accepted.' };
      }
      current = operator;
      return { stage: 'signed_in', session: operator, deviceRecognised: true };
    },
    async recogniseDevice() {
      calls.push('recogniseDevice');
      return true;
    },
    async signOut() {
      calls.push('signOut');
      current = null;
    },
    async startImpersonation(request) {
      calls.push('startImpersonation');
      audit.push(request.stamp);
      await wait();
      if (request.targetId === operator.operatorId) throw new AuthRefusal('refused', 'You cannot impersonate your own account.');
      const impersonation: ImpersonationSession = {
        operatorId: request.operatorId,
        targetId: request.targetId,
        targetLabel: request.targetLabel,
        reason: request.reason,
        startedAt: request.stamp.at,
        expiresAt: new Date(Date.parse(request.stamp.at) + request.durationMinutes * 60_000).toISOString(),
        stamp: request.stamp,
      };
      current = { ...operator, impersonation };
      return current;
    },
    async endImpersonation(request) {
      calls.push('endImpersonation');
      audit.push(request.stamp);
      current = current === null ? null : { ...current, impersonation: null };
    },
  };
}

/** Capabilities for tests that need a known grant set without reading role tables. */
export function capabilitiesFor(...capabilities: Capability[]): readonly Capability[] {
  return capabilities;
}

export const FIXTURE_STAFF = { email: 'staff@nastech.test', password: FIXTURE_PASSWORD, now: FIXTURE_NOW };
