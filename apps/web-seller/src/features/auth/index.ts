import { createElement } from 'react';
import type { RouteDef } from '../../router.js';
import { SignInPage } from './signin-page.js';
import { MagicLinkReturn, magicTokenFromLocation } from './magic-link-return.js';
import { createFixtureAuthTransport } from './api/fixtures.js';

/**
 * `/sign-in` (class `critical`). One route, two entry shapes: a bare visit shows the form; a visit
 * carrying a magic-link token consumes it. The route never renders the token.
 */
export default function Page({ route }: { route: RouteDef }) {
  void route;
  const href = typeof window === 'undefined' ? '' : window.location.href;
  const transport = createFixtureAuthTransport();
  if (magicTokenFromLocation(href) !== null) {
    return createElement(MagicLinkReturn, { transport });
  }
  return createElement(SignInPage, { transport });
}

export { SignInPage, safeReturnTo, hasLiveSession } from './signin-page.js';
export { MagicLinkReturn, magicTokenFromLocation } from './magic-link-return.js';
export { signOut } from './signout.js';
export {
  readSellerSession,
  writeSellerSession,
  clearSellerSession,
  isSellerSession,
  isSessionLive,
  memoryStore,
  SESSION_STORAGE_KEY,
  SESSION_EVENT,
} from './session.js';
export type { SellerSession, KeyValueStore } from './session.js';
export { parseIdentifier, normalisePhone, maskPhone, maskEmail } from './identifier.js';
export { trustThisDevice, readDeviceTrust, revokeDeviceTrust, deviceLabel } from './device-trust.js';
export { AuthError, isAuthError, AUTH_ERROR_COPY } from './api/auth-transport.js';
export type { AuthTransport, AuthTicket, AuthErrorCode } from './api/auth-transport.js';
export { createFixtureAuthTransport, DEMO_SIGN_IN_CODE } from './api/fixtures.js';
