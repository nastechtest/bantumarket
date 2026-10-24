/**
 * Auth feature entry. The controller wires `/sign-in` through routes/SignIn.tsx; the other paths
 * below are the ones this brief assumes and asks the controller to add to the route table
 * (wave-b rule: report, don't edit router.tsx):
 *
 *   /register          class 'critical' — registration is identity, same fence as sign-in
 *   /reset-password    class 'critical' — password reset, same reason
 *   /magic-link        class 'critical' — magic-link request + fragment consumer
 *   /account           class 'first-paint'
 *   /account/data-request  class 'first-paint' (POPIA entry point, must be reachable cheaply)
 *   /account/close     class 'first-paint'
 *
 * `route` is accepted for the router contract; unknown routes fall back to sign-in rather than
 * blanking, because a mistyped route on the auth surface should still be able to get you in.
 *
 * Written with createElement rather than JSX so the file stays `.ts` exactly as the brief's
 * file list names it — the router only ever needs the dispatch.
 */
import { createElement } from 'react';
import type { RouteDef } from '../../router.js';
import { SigninPage } from './signin-page.js';
import { RegisterPage } from './register-page.js';
import { ResetRequest } from './reset-request.js';
import { MagicLinkConsumer, MagicLinkRequest } from './magic-link.js';
import { createFakeAuthApi, type FakeAuthHarness } from './api/fixtures.js';
import type { AuthApi } from './api/auth-transport.js';

/** Exposed so the app shell can inject one harness/transport for every auth surface. */
export const defaultAuthHarness: FakeAuthHarness = createFakeAuthApi();

export default function Page({ route, api }: { route: RouteDef; api?: AuthApi }) {
  const auth = api ?? defaultAuthHarness.api;
  switch (route.path) {
    case '/sign-in':
      return createElement(SigninPage, { api: auth });
    case '/register':
      return createElement(RegisterPage, { api: auth });
    case '/reset-password':
      return createElement(ResetRequest, { api: auth });
    case '/magic-link':
      // A link opened from email arrives with #ml=<token>; a bare visit is the request form.
      return window.location.hash.includes('ml=')
        ? createElement(MagicLinkConsumer, { api: auth, onVerified: () => {} })
        : createElement(MagicLinkRequest, { api: auth });
    default:
      return createElement(SigninPage, { api: auth });
  }
}

export { SigninPage } from './signin-page.js';
export { RegisterPage } from './register-page.js';
export { PhoneStep } from './phone-step.js';
export { OtpStep } from './otp-step.js';
export { EmailStep } from './email-step.js';
export { PasswordStep } from './password-step.js';
export { ConsentStep } from './consent-step.js';
export { PolicyLinks } from './policy-links.js';
export { ResetRequest } from './reset-request.js';
export { ResetConfirm } from './reset-confirm.js';
export { MagicLinkRequest, MagicLinkConsumer } from './magic-link.js';
export { useSession } from './use-session.js';
export { RequireSession } from './routes-guard.js';
export { createSessionStore, memoryKeyValues, webKeyValues } from './session-storage.js';
export type { PublicSessionHint, SessionStore, KeyValueStore } from './session-storage.js';
export { createFakeAuthApi } from './api/fixtures.js';
export { AuthError, isAuthError, AUTH_ERROR_COPY } from './api/auth-transport.js';
export type { AuthApi, AuthErrorCode, DeviceSession, OtpTicket, OtpChannel, RegisterInput, SessionInfo } from './api/auth-transport.js';
export type { SessionStatus, UseSessionResult } from './use-session.js';
export { parsePhone, formatPhone, maskPhone, isSaMobile } from './phone.js';
export { scorePassword } from './strength.js';
export type { StrengthResult, StrengthScore, StrengthContext } from './strength.js';
export { resendDecisionAt, initialCooldown, applySend, applyBlocked, formatCountdown } from './resend-cooldown.js';
export type { CooldownState, ResendDecision } from './resend-cooldown.js';
