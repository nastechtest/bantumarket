/**
 * The auth transport seam.
 *
 * There is no Identity module in the PHP backend yet. Every method below names the endpoint it
 * assumes, and the whole interface is one big CONTRACT-GAP: the controller wires an HTTP
 * implementation when brief-06's Identity module lands. Until then `fixtures.ts` provides a
 * faithful local implementation, and NOTHING here may be described to a user as "the API".
 *
 * Security invariants this interface exists to make impossible to violate at call sites:
 * - No method ever returns an OTP code, an expired code's value, or anything that identifies
 *   whether an account exists for an unknown identifier (anti-enumeration).
 * - Errors are typed codes, not strings carrying user input. `AuthError.message` is fixed copy;
 *   the wrong code the buyer typed is never in it, so no log line can echo an OTP.
 * - Session credentials are cookie-first (http-only, SameSite=Lax). The bearer fallback
 *   (`accessToken`, short-lived, memory-only) exists for the case the transport cannot set
 *   cookies — see README, it is an assumption, not a design preference.
 * - No token ever travels in a query string or in any URL the buyer can be looked over. The magic
 *   link is the one exception the product allows, and it is carried in a URL *fragment*, which
 *   never reaches a server log, and is stripped from the address bar on first read.
 *
 * Assumed endpoints (all new, none exist server-side today):
 *   POST /v1/auth/otp/request          { e164 }                      -> 202 { otpId, sentToMasked, resendAfterSec }
 *   POST /v1/auth/otp/verify           { otpId, code }               -> 201 Set-Cookie session | 4xx AuthErrorCode
 *   POST /v1/auth/register             { e164, verifiedOtpId, ... }  -> 201 session
 *   POST /v1/auth/password/sign-in     { identifier, password }      -> 200 session | 401 invalid_credentials
 *   POST /v1/auth/magic-link/request   { email }                     -> 202 (always, even unknown email)
 *   POST /v1/auth/magic-link/consume   { token }                     -> 200 session | 400 magic_token_invalid
 *   POST /v1/auth/reset/request        { e164? , email? }            -> 202 { resetId, sentToMasked, resendAfterSec }
 *   POST /v1/auth/reset/confirm        { resetId, code, newPassword } -> 201 session
 *   GET  /v1/auth/session              (cookie)                      -> 200 SessionInfo | 401 null
 *   POST /v1/auth/session/end          (cookie)                      -> 204
 *   GET  /v1/auth/sessions             (cookie)                      -> [{ DeviceSession }]
 *   DELETE /v1/auth/sessions/:id       (cookie)                      -> 204
 */

import type { VerificationTier } from '@nastech/api-contracts';

export type OtpChannel = 'sms' | 'email';
// CONTRACT-GAP: whatsapp channel is a real SA delivery expectation but unconfirmed with the
// Identity module; it is intentionally NOT in this union yet so no UI ships a promise we can't keep.

export type AuthErrorCode =
  | 'invalid_code'
  | 'code_expired'
  | 'attempts_exhausted'
  | 'rate_limited'
  | 'invalid_credentials'
  | 'phone_unverified'
  | 'phone_taken'
  | 'email_taken'
  | 'consent_required'
  | 'magic_token_invalid'
  | 'network'
  | 'server';

/**
 * `message` is fixed, human, and input-free by construction: the constructors below are the only
 * way to make one, and none of them accept a variable containing user input. A code that can be
 * interpolated into a log line will eventually be interpolated into a log line.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly retryAfterSec?: number;
  readonly attemptsLeft?: number;

  private constructor(code: AuthErrorCode, init: { retryAfterSec?: number; attemptsLeft?: number }) {
    super(`auth:${code}`);
    this.name = 'AuthError';
    this.code = code;
    if (init.retryAfterSec !== undefined) this.retryAfterSec = init.retryAfterSec;
    if (init.attemptsLeft !== undefined) this.attemptsLeft = init.attemptsLeft;
  }

  static of(code: AuthErrorCode, init: { retryAfterSec?: number; attemptsLeft?: number } = {}): AuthError {
    return new AuthError(code, init);
  }
}

export function isAuthError(e: unknown): e is AuthError {
  return e instanceof AuthError;
}

export interface SessionInfo {
  readonly sessionId: string;
  /** The identity anchor in this product: the verified phone number. */
  readonly e164: string;
  readonly email?: string | undefined;
  readonly tier: VerificationTier;
  readonly createdAtMs: number;
}

export interface DeviceSession extends SessionInfo {
  readonly lastActiveMs: number;
  readonly deviceLabel: string;
  readonly current: boolean;
}

export interface OtpTicket {
  readonly otpId: string;
  /** Masked at the transport boundary so the full number never reaches the render tree by accident. */
  readonly sentToMasked: string;
  readonly resendAfterSec: number;
}

export interface RegisterInput {
  readonly e164: string;
  /** OTP id that was successfully verified minutes ago; registration without proof-of-phone is refused. */
  readonly verifiedOtpId: string;
  readonly email?: string | undefined;
  readonly password?: string | undefined;
  readonly marketingOptIn: boolean;
  readonly acceptedTerms: boolean;
  readonly acceptedPrivacyNotice: boolean;
}

export interface AuthApi {
  requestOtp(input: { e164: string; channel?: OtpChannel }): Promise<OtpTicket>;
  verifyOtp(input: { otpId: string; code: string }): Promise<{ session: SessionInfo }>;
  register(input: RegisterInput): Promise<{ session: SessionInfo }>;
  signInWithPassword(input: { identifier: string; password: string }): Promise<{ session: SessionInfo }>;
  requestMagicLink(input: { email: string }): Promise<{ sent: true }>;
  consumeMagicLink(input: { token: string }): Promise<{ session: SessionInfo }>;
  requestPasswordReset(input: { e164?: string; email?: string }): Promise<OtpTicket & { resetId: string }>;
  confirmPasswordReset(input: { resetId: string; code: string; newPassword: string }): Promise<{ session: SessionInfo }>;
  /** The re-verification call. 401/null means anonymous; nothing on the client substitutes for it. */
  getSession(): Promise<SessionInfo | null>;
  endSession(): Promise<void>;
  listSessions(): Promise<DeviceSession[]>;
  revokeSession(sessionId: string): Promise<void>;
}

/** Fixed copy per error code, rendered by the flow screens. No interpolation of user input, ever. */
export const AUTH_ERROR_COPY: Readonly<Record<AuthErrorCode, string>> = {
  invalid_code: 'That code does not match. Check the SMS and try again.',
  code_expired: 'That code has expired. Codes are only valid for a few minutes.',
  attempts_exhausted: 'Too many wrong attempts on this code. Request a new one.',
  rate_limited: 'Too many code requests. Wait before trying again.',
  invalid_credentials: 'That number/email and password do not match an account.',
  phone_unverified: 'Verify your number with a code first.',
  phone_taken: 'An account already uses this number. Sign in instead.',
  email_taken: 'An account already uses this email. Sign in instead.',
  consent_required: 'We need your agreement to the terms and privacy notice to continue.',
  magic_token_invalid: 'That link has been used or has expired. Request a new one or use a text code.',
  network: 'No connection. Check your data and try again.',
  server: 'Something went wrong on our side. Try once more.',
};
