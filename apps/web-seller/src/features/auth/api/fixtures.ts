import type { SellerSession } from '../session.js';
import { maskEmail, maskPhone } from '../identifier.js';
import type { ParsedIdentifier } from '../identifier.js';
import { AUTH_ERROR_COPY, AuthError } from './auth-transport.js';
import type { AuthTicket, AuthTransport } from './auth-transport.js';

/**
 * Demo identity backend. The code is fixed and shown on screen as a demo hint — without a live
 * SMS provider there is no honest alternative, and a hidden fake code would make the app
 * unusable rather than more secure. The hint is rendered only by the fixture transport.
 */

export const DEMO_SIGN_IN_CODE = '482913';
export const DEMO_MAGIC_TOKEN = 'ml_demo_nomsa';

export interface FixtureAuthOptions {
  readonly code?: string;
  readonly latencyMs?: number;
  readonly allowUnknownIdentifier?: boolean;
  readonly failNext?: 'network' | 'rate_limited' | null;
}

export interface FixtureAuthTransport extends AuthTransport {
  readonly issuedCodes: () => number;
  readonly lastTicket: () => AuthTicket | null;
  readonly demoHint: string;
}

interface TicketRecord {
  readonly identifier: ParsedIdentifier;
  readonly code: string;
  readonly expiresAt: number;
  attempts: number;
}

export function createFixtureAuthTransport(options: FixtureAuthOptions = {}): FixtureAuthTransport {
  const code = options.code ?? DEMO_SIGN_IN_CODE;
  const latency = options.latencyMs ?? 0;
  let issued = 0;
  let last: AuthTicket | null = null;
  const tickets = new Map<string, TicketRecord>();
  let failNext = options.failNext ?? null;

  async function wait(): Promise<void> {
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
  }

  function sessionFor(identifier: ParsedIdentifier, now: number): SellerSession {
    return {
      sellerId: 'usr_seller_pieter',
      displayName: 'Pieter',
      email: identifier.kind === 'email' ? identifier.value : 'pieter@example.co.za',
      phone: identifier.kind === 'phone' ? identifier.value : '+27821234567',
      tier: 'T2',
      signedInAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  return {
    issuedCodes: () => issued,
    lastTicket: () => last,
    demoHint: `Demo code: ${code}`,
    async requestCode(identifier) {
      await wait();
      if (failNext === 'network') {
        failNext = null;
        throw new AuthError('network', AUTH_ERROR_COPY.network);
      }
      if (failNext === 'rate_limited') {
        failNext = null;
        throw new AuthError('rate_limited');
      }
      if (options.allowUnknownIdentifier === false && identifier.value === '+27829999999') {
        throw new AuthError('identifier_unknown');
      }
      issued += 1;
      const now = Date.now();
      const ticketId = `tkt_${issued}`;
      const ticket: AuthTicket = {
        ticketId,
        channel: identifier.kind === 'email' ? 'email' : 'sms',
        destination: identifier.kind === 'email' ? maskEmail(identifier.value) : maskPhone(identifier.value),
        expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
        resendAt: new Date(now + 30 * 1000).toISOString(),
        attemptsRemaining: 5,
      };
      tickets.set(ticketId, { identifier, code, expiresAt: now + 10 * 60 * 1000, attempts: 0 });
      last = ticket;
      return ticket;
    },

    async verifyCode(ticketId, entered) {
      await wait();
      const record = tickets.get(ticketId);
      if (record === undefined) throw new AuthError('expired_code');
      if (Date.now() > record.expiresAt) {
        tickets.delete(ticketId);
        throw new AuthError('expired_code');
      }
      if (record.attempts >= 5) throw new AuthError('too_many_attempts');
      record.attempts += 1;
      if (entered !== record.code) {
        if (record.attempts >= 5) throw new AuthError('too_many_attempts');
        throw new AuthError('invalid_code');
      }
      tickets.delete(ticketId);
      return sessionFor(record.identifier, Date.now());
    },

    async verifyLink(token) {
      await wait();
      if (failNext === 'network') {
        failNext = null;
        throw new AuthError('network');
      }
      if (token !== DEMO_MAGIC_TOKEN) throw new AuthError('link_expired');
      return sessionFor(
        { ok: true, kind: 'phone', value: '+27821234567', display: '082 123 4567' },
        Date.now(),
      );
    },

    async signOut() {
      await wait();
    },
  };
}
