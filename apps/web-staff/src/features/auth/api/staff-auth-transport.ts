import type { AuditStamp } from '../../../shell/audit-stamp.js';
import type { StaffSession } from '../../../shell/session.js';

export type SignInStage = 'mfa_required' | 'signed_in' | 'refused';

export interface SignInRequest {
  readonly email: string;
  readonly password: string;
  readonly deviceId: string;
}

export interface SignInResult {
  readonly stage: SignInStage;
  /** Present when `stage === 'mfa_required'`. */
  readonly challengeId?: string;
  /** Present when `stage === 'signed_in'`; must carry `mfaSatisfied: true`. */
  readonly session?: StaffSession;
  /** Seller-safe wording; never says whether an account exists. */
  readonly refusal?: string;
  readonly deviceRecognised?: boolean;
}

export interface MfaRequest {
  readonly challengeId: string;
  readonly code: string;
}

export interface ImpersonationStart {
  readonly operatorId: string;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly reason: string;
  readonly durationMinutes: number;
  /** Written before the session exists; the transport must reject a request without it. */
  readonly stamp: AuditStamp;
}

export interface ImpersonationEnd {
  readonly operatorId: string;
  readonly targetId: string;
  readonly at: string;
  readonly stamp: AuditStamp;
}

export interface StaffAuthTransport {
  beginSignIn(request: SignInRequest): Promise<SignInResult>;
  verifyMfa(request: MfaRequest): Promise<SignInResult>;
  recogniseDevice(deviceId: string): Promise<boolean>;
  signOut(session: StaffSession): Promise<void>;
  startImpersonation?(request: ImpersonationStart): Promise<StaffSession>;
  endImpersonation?(request: ImpersonationEnd): Promise<void>;
}

export class AuthRefusal extends Error {
  readonly code: 'refused' | 'mfa_missing' | 'unavailable';

  constructor(code: 'refused' | 'mfa_missing' | 'unavailable', message: string) {
    super(message);
    this.name = 'AuthRefusal';
    this.code = code;
  }
}
