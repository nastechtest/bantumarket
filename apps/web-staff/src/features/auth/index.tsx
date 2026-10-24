import type { RouteDef } from '../../router.js';
import { SignInPage } from './signin-page.js';

export { SignInPage };
export { MfaStep, isMfaCodeValid, MFA_CODE_LENGTH } from './mfa-step.js';
export { deviceNotice, devicePosture, requiresAcknowledgement } from './device-recognised.js';
export type { DevicePosture } from './device-recognised.js';
export {
  beginImpersonation,
  endImpersonation,
  planImpersonation,
  ImpersonatePanel,
  ImpersonationBanner,
  MAX_IMPERSONATION_MINUTES,
  MIN_IMPERSONATION_REASON,
} from './impersonate.js';
export type { ImpersonationDraft, ImpersonationPlan } from './impersonate.js';
export { SessionTimeoutWatcher, sessionStatus, SESSION_WARNING_MS } from './session-timeout.js';
export type { SessionStatus } from './session-timeout.js';
export { createAuthFixture, FIXTURE_MFA_CODE, FIXTURE_PASSWORD, FIXTURE_STAFF } from './api/fixtures.js';
export type { AuthFixture, AuthFixtureOptions } from './api/fixtures.js';
export type { SignInRequest, SignInResult, SignInStage, StaffAuthTransport } from './api/staff-auth-transport.js';
export { AuthRefusal } from './api/staff-auth-transport.js';

export default function AuthFeaturePage({ route }: { route: RouteDef }) {
  return <SignInPage />;
}
