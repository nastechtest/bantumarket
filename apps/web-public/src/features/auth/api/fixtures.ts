/**
 * Local fake of AuthApi — this is the "Identity service" until the PHP module exists (CONTRACT-GAP).
 *
 * It is a faithful simulation, not a stub: real cooldowns, real attempt limits, real expiry, an
 * outbox that stands in for the SMS gateway. The outbox contains the actual codes; it is the
 * delivery side of the pipe and tests read it there. No AuthApi *response* ever carries a code,
 * which is exactly the property otp.test.tsx asserts against the rendered DOM.
 *
 * Passwords here are stored in the clear because this is a test fixture with no persistence;
 * the real Identity module must use argon2id and this fixture is not evidence of hashing policy.
 */

import {
  AuthError,
  type AuthApi,
  type DeviceSession,
  type OtpTicket,
  type RegisterInput,
  type SessionInfo,
} from './auth-transport.js';
import { maskPhone } from '../phone.js';
import type { VerificationTier } from '@nastech/api-contracts';

export const FIXTURE_LIMITS = {
  otpTtlMs: 5 * 60_000,
  codeLength: 6,
  maxVerifyAttempts: 5,
  resendCooldownSec: 30,
  maxSendsPerWindow: 3,
  sendWindowMs: 15 * 60_000,
  blockedRetrySec: 15 * 60,
  maxPasswordFails: 8,
  magicTtlMs: 10 * 60_000,
  resetTtlMs: 10 * 60_000,
  /** A verified OTP is only proof-of-phone for this long at registration time. */
  verifyStaleMs: 30 * 60_000,
} as const;

export interface OutboxEntry {
  readonly to: string;
  readonly kind: 'sms-otp' | 'sms-reset' | 'email-magic' | 'email-reset';
  /** The only place a live code exists in this fixture. Tests read it here; UI must not. */
  readonly code: string;
  readonly sentAtMs: number;
}

interface OtpRecord {
  otpId: string;
  kind: 'otp' | 'reset';
  e164: string;
  code: string;
  issuedAtMs: number;
  expiresAtMs: number;
  attempts: number;
  consumedAtMs: number | null;
  sendTimesMs: number[];
  lastSentAtMs: number;
}

interface MagicRecord {
  e164: string;
  expiresAtMs: number;
  used: boolean;
}

interface SeedUser {
  email?: string;
  password?: string;
  tier: VerificationTier;
  marketingOptIn: boolean;
}

export interface FakeAuthHarness {
  readonly api: AuthApi;
  readonly clock: { now(): number; advance(ms: number): void };
  readonly outbox: OutboxEntry[];
  seedUser(e164: string, user?: Partial<SeedUser>): void;
  /** Simulates a second device already signed in, for the sessions list. */
  seedDeviceSession(e164: string, deviceLabel: string): DeviceSession;
  userExists(e164: string): boolean;
}

// xmur3 → mulberry32: a seeded PRNG so codes are deterministic per (identifier, send index).
// Test-visible codes are never random, which keeps suites from flaking while still being
// values no call site can hardcode.
function seededCode(seedText: string, length: number): string {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h >>> 0) | 1;
  let out = '';
  for (let i = 0; i < length; i++) {
    a = Math.imul(a ^ (a >>> 15), 2246822507);
    a = Math.imul(a ^ (a >>> 13), 3266489909);
    a ^= a >>> 16;
    out += String((a >>> 0) % 10);
  }
  return out;
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  const local = at > 0 ? email.slice(0, at) : email;
  const domain = at > 0 ? email.slice(at) : '';
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, local.length - head.length))}${domain}`;
}

export function createFakeAuthApi(opts: { nowMs?: number } = {}): FakeAuthHarness {
  let nowMs = opts.nowMs ?? 1_730_000_000_000;
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;

  const users = new Map<string, SeedUser & { createdAtMs: number }>();
  const emailIndex = new Map<string, string>();
  const otps = new Map<string, OtpRecord>();
  const magics = new Map<string, MagicRecord>();
  const sessions: SessionInfo[] = [];
  const deviceMeta = new Map<string, { lastActiveMs: number; deviceLabel: string }>();
  let currentSessionId: string | null = null;
  const pwFails = new Map<string, number>();
  const outbox: OutboxEntry[] = [];

  const clock = { now: () => nowMs, advance: (ms: number) => { nowMs += ms; } };

  function openSession(e164: string, deviceLabel = 'This phone'): SessionInfo {
    const user = users.get(e164);
    const session: SessionInfo = {
      sessionId: nextId('sess'),
      e164,
      ...(user?.email !== undefined ? { email: user.email } : {}),
      tier: user?.tier ?? 'T1',
      createdAtMs: nowMs,
    };
    sessions.push(session);
    deviceMeta.set(session.sessionId, { lastActiveMs: nowMs, deviceLabel });
    currentSessionId = session.sessionId;
    return session;
  }

  function sendGate(existing: OtpRecord | undefined, e164: string, kind: OtpRecord['kind']): OtpRecord {
    const windowSends = (existing?.sendTimesMs ?? []).filter((t) => nowMs - t < FIXTURE_LIMITS.sendWindowMs);
    if (existing && nowMs - existing.lastSentAtMs < FIXTURE_LIMITS.resendCooldownSec * 1000) {
      // Server-side answer to a resend fired inside the cooldown. The UI gates this too; both
      // sides enforce because the client gate is comfort and this gate is the rule.
      throw AuthError.of('rate_limited', {
        retryAfterSec: Math.ceil((existing.lastSentAtMs + FIXTURE_LIMITS.resendCooldownSec * 1000 - nowMs) / 1000),
      });
    }
    if (windowSends.length >= FIXTURE_LIMITS.maxSendsPerWindow) {
      const oldest = Math.min(...windowSends);
      throw AuthError.of('rate_limited', {
        retryAfterSec: Math.ceil((oldest + FIXTURE_LIMITS.sendWindowMs - nowMs) / 1000),
      });
    }

    const canReuse = existing && existing.consumedAtMs === null && existing.attempts < FIXTURE_LIMITS.maxVerifyAttempts && nowMs < existing.expiresAtMs;
    if (canReuse && existing) {
      // The live ticket is still good, so the server re-sends the same code rather than minting a
      // parallel one — but a resend is still a real SMS and must appear in the delivery outbox.
      // (Without this, the UI could "resend" all day and no gateway would ever be asked.)
      existing.sendTimesMs.push(nowMs);
      existing.lastSentAtMs = nowMs;
      outbox.push({ to: e164, kind: kind === 'otp' ? 'sms-otp' : 'sms-reset', code: existing.code, sentAtMs: nowMs });
      return existing;
    }

    const sendIndex = existing ? existing.sendTimesMs.length + 1 : 1;
    const code = seededCode(`${e164}:${kind}:${existing?.otpId ?? 'new'}:${sendIndex}`, FIXTURE_LIMITS.codeLength);
    const ttl = kind === 'otp' ? FIXTURE_LIMITS.otpTtlMs : FIXTURE_LIMITS.resetTtlMs;
    const record: OtpRecord = {
      otpId: existing?.otpId ?? nextId(kind),
      kind,
      e164,
      code,
      issuedAtMs: nowMs,
      expiresAtMs: nowMs + ttl,
      // Reaching this branch means the previous ticket was dead (expired/consumed/exhausted):
      // the fresh code starts with a full set of attempts, or exhaustion would become permanent.
      attempts: 0,
      consumedAtMs: null,
      sendTimesMs: [...(existing?.sendTimesMs ?? []), nowMs],
      lastSentAtMs: nowMs,
    };
    otps.set(record.otpId, record);
    outbox.push({ to: e164, kind: kind === 'otp' ? 'sms-otp' : 'sms-reset', code, sentAtMs: nowMs });
    return record;
  }

  function verifyTicket(otpId: string, code: string): OtpRecord {
    const rec = otps.get(otpId);
    // Every failure path below answers in a way that does not reveal whether the number exists,
    // whether the code was right-but-used, or where the boundary is.
    if (!rec) throw AuthError.of('invalid_code', { attemptsLeft: 0 });
    if (rec.consumedAtMs !== null || nowMs >= rec.expiresAtMs) {
      // A replayed post-success code gets the same answer as an expired one: both are dead.
      throw AuthError.of('code_expired');
    }
    if (rec.attempts >= FIXTURE_LIMITS.maxVerifyAttempts) throw AuthError.of('attempts_exhausted');
    if (rec.code !== code) {
      rec.attempts += 1;
      if (rec.attempts >= FIXTURE_LIMITS.maxVerifyAttempts) throw AuthError.of('attempts_exhausted');
      throw AuthError.of('invalid_code', { attemptsLeft: FIXTURE_LIMITS.maxVerifyAttempts - rec.attempts });
    }
    rec.consumedAtMs = nowMs;
    return rec;
  }

  const api: AuthApi = {
    async requestOtp({ e164 }) {
      const active = [...otps.values()].find((r) => r.kind === 'otp' && r.e164 === e164);
      const rec = sendGate(active, e164, 'otp');
      return { otpId: rec.otpId, sentToMasked: maskPhone(e164), resendAfterSec: FIXTURE_LIMITS.resendCooldownSec };
    },

    async verifyOtp({ otpId, code }) {
      const rec = verifyTicket(otpId, code);
      if (rec.kind !== 'otp') throw AuthError.of('invalid_code');
      return { session: openSession(rec.e164) };
    },

    async register(input: RegisterInput) {
      if (!input.acceptedTerms || !input.acceptedPrivacyNotice) throw AuthError.of('consent_required');
      if (users.has(input.e164)) throw AuthError.of('phone_taken');
      if (input.email !== undefined && input.email !== '' && emailIndex.has(input.email.toLowerCase())) {
        throw AuthError.of('email_taken');
      }
      const proof = otps.get(input.verifiedOtpId);
      if (!proof || proof.kind !== 'otp' || proof.e164 !== input.e164 || proof.consumedAtMs === null) {
        throw AuthError.of('phone_unverified');
      }
      if (nowMs - proof.consumedAtMs > FIXTURE_LIMITS.verifyStaleMs) throw AuthError.of('phone_unverified');

      users.set(input.e164, {
        tier: 'T1',
        marketingOptIn: input.marketingOptIn,
        ...(input.email !== undefined && input.email !== '' ? { email: input.email.toLowerCase() } : {}),
        ...(input.password !== undefined && input.password !== '' ? { password: input.password } : {}),
        createdAtMs: nowMs,
      });
      if (input.email) emailIndex.set(input.email.toLowerCase(), input.e164);
      return { session: openSession(input.e164) };
    },

    async signInWithPassword({ identifier, password }) {
      const fails = pwFails.get(identifier) ?? 0;
      if (fails >= FIXTURE_LIMITS.maxPasswordFails) {
        throw AuthError.of('rate_limited', { retryAfterSec: FIXTURE_LIMITS.blockedRetrySec });
      }
      const e164 = identifier.startsWith('+') || /^\d/.test(identifier)
        ? identifier
        : emailIndex.get(identifier.toLowerCase());
      const user = e164 ? users.get(e164) : undefined;
      if (!user || user.password === undefined || user.password !== password) {
        pwFails.set(identifier, fails + 1);
        // Same answer for "no such account" and "wrong password" — no enumeration oracle.
        throw AuthError.of('invalid_credentials');
      }
      pwFails.delete(identifier);
      return { session: openSession(e164!) };
    },

    async requestMagicLink({ email }) {
      const e164 = emailIndex.get(email.toLowerCase());
      if (e164) {
        const token = `${seededCode(`magic:${email}:${nowMs}`, 24)}`;
        magics.set(token, { e164, expiresAtMs: nowMs + FIXTURE_LIMITS.magicTtlMs, used: false });
        outbox.push({ to: email, kind: 'email-magic', code: token, sentAtMs: nowMs });
      }
      // Always { sent: true }: the response must not tell a stranger whether the email is ours.
      return { sent: true };
    },

    async consumeMagicLink({ token }) {
      const rec = magics.get(token);
      if (!rec || rec.used || nowMs >= rec.expiresAtMs) throw AuthError.of('magic_token_invalid');
      rec.used = true;
      return { session: openSession(rec.e164) };
    },

    async requestPasswordReset({ e164, email }) {
      let target = e164;
      let masked = maskPhone(email ?? '+00');
      if (target === undefined && email !== undefined) {
        target = emailIndex.get(email.toLowerCase());
        masked = maskEmail(email);
      } else if (target !== undefined) {
        masked = maskPhone(target);
      }
      if (target === undefined) {
        // Unknown identifier: answer as if it worked, send nothing. The shape is identical to the
        // real answer — including otpId — because a reset screen that differs by field presence is
        // an account-enumeration oracle.
        const noopId = nextId('reset-noop');
        return { resetId: noopId, otpId: noopId, sentToMasked: masked, resendAfterSec: FIXTURE_LIMITS.resendCooldownSec };
      }
      const active = [...otps.values()].find((r) => r.kind === 'reset' && r.e164 === target);
      const rec = sendGate(active, target, 'reset');
      return { resetId: rec.otpId, otpId: rec.otpId, sentToMasked: masked, resendAfterSec: FIXTURE_LIMITS.resendCooldownSec };
    },

    async confirmPasswordReset({ resetId, code, newPassword }) {
      const rec = verifyTicket(resetId, code);
      if (rec.kind !== 'reset') throw AuthError.of('invalid_code');
      const user = users.get(rec.e164);
      if (user) {
        user.password = newPassword;
        if (user.email) emailIndex.set(user.email, rec.e164);
      }
      return { session: openSession(rec.e164) };
    },

    async getSession() {
      if (currentSessionId === null) return null;
      const s = sessions.find((x) => x.sessionId === currentSessionId);
      if (!s) {
        currentSessionId = null;
        return null;
      }
      const meta = deviceMeta.get(s.sessionId);
      if (meta) meta.lastActiveMs = nowMs;
      return s;
    },

    async endSession() {
      if (currentSessionId !== null) {
        const i = sessions.findIndex((x) => x.sessionId === currentSessionId);
        if (i >= 0) sessions.splice(i, 1);
        deviceMeta.delete(currentSessionId);
      }
      currentSessionId = null;
    },

    async listSessions() {
      return sessions.map((s) => {
        const meta = deviceMeta.get(s.sessionId)!;
        return {
          ...s,
          lastActiveMs: meta.lastActiveMs,
          deviceLabel: meta.deviceLabel,
          current: s.sessionId === currentSessionId,
        } satisfies DeviceSession;
      });
    },

    async revokeSession(sessionId) {
      const i = sessions.findIndex((x) => x.sessionId === sessionId);
      if (i >= 0) sessions.splice(i, 1);
      deviceMeta.delete(sessionId);
      if (currentSessionId === sessionId) currentSessionId = null;
    },
  };

  return {
    api,
    clock,
    outbox,
    seedUser(e164, user = {}) {
      // Conditional spreads, not `email: user.email?.toLowerCase()`: an absent password means
      // "this account has no password, OTP only", and writing the key with value undefined would
      // turn that fact into a lie the read path cannot distinguish.
      users.set(e164, {
        ...(user.email !== undefined ? { email: user.email.toLowerCase() } : {}),
        ...(user.password !== undefined ? { password: user.password } : {}),
        tier: user.tier ?? 'T1',
        marketingOptIn: user.marketingOptIn ?? false,
        createdAtMs: nowMs,
      });
      if (user.email) emailIndex.set(user.email.toLowerCase(), e164);
    },
    seedDeviceSession(e164, deviceLabel) {
      const session = openSession(e164, deviceLabel);
      currentSessionId = null; // seeded devices are "elsewhere", not here
      return { ...session, lastActiveMs: nowMs, deviceLabel, current: false };
    },
    userExists: (e164) => users.has(e164),
  };
}
