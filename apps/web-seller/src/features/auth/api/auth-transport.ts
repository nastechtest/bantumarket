import type { SellerSession } from '../session.js';
import type { ParsedIdentifier } from '../identifier.js';

/**
 * Sign-in transport.
 *
 * CONTRACT-GAP: the Identity module may not have landed in PHP (wave D). These are the endpoints
 * assumed, recorded here and in README.md:
 *   POST /v1/auth/seller/code          { identifier, kind }            → AuthTicket
 *   POST /v1/auth/seller/verify        { ticketId, code }              → SellerSession
 *   POST /v1/auth/seller/magic-link    { token }                       → SellerSession
 *   POST /v1/auth/seller/sign-out      (session bearer)                → 204
 * The seller surface deliberately has no password: a phone-first market forgets passwords and a
 * reset flow is another way to lose an account. Codes are six digits, single use, five attempts.
 */

export type AuthChannel = 'sms' | 'email';

export interface AuthTicket {
  readonly ticketId: string;
  readonly channel: AuthChannel;
  /** Masked destination, safe to echo (`082 ••• 67`). The raw identifier is never returned. */
  readonly destination: string;
  readonly expiresAt: string;
  readonly resendAt: string;
  readonly attemptsRemaining: number;
}

export type AuthErrorCode =
  | 'invalid_code'
  | 'expired_code'
  | 'too_many_attempts'
  | 'rate_limited'
  | 'network'
  | 'identifier_unknown'
  | 'link_expired';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? AUTH_ERROR_COPY[code]);
    this.name = 'AuthError';
    this.code = code;
  }
}

export const AUTH_ERROR_COPY: Readonly<Record<AuthErrorCode, string>> = {
  invalid_code: 'That code is not right. Check the six digits and try again.',
  expired_code: 'That code has expired. Ask for a new one.',
  too_many_attempts: 'Too many tries. Ask for a new code — the old one no longer works.',
  rate_limited: 'Too many requests from this number. Wait a minute before asking again.',
  network: 'We could not reach NasTech. Check your signal and try again.',
  identifier_unknown: 'That number is not on a seller account. Check it, or start selling first.',
  link_expired: 'That sign-in link has expired. Ask for a new sign-in code.',
};

export interface AuthTransport {
  requestCode(identifier: ParsedIdentifier): Promise<AuthTicket>;
  verifyCode(ticketId: string, code: string): Promise<SellerSession>;
  /** Magic links carry a single-use token; the token is consumed, never displayed again. */
  verifyLink(token: string): Promise<SellerSession>;
  signOut(session: SellerSession): Promise<void>;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
