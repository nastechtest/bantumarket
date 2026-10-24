/**
 * Resend cooldown for OTP delivery, as a pure function of (now, state).
 *
 * Why it exists client-side at all when the server enforces it: a buyer hammering "send code"
 * on a 3G connection burns their airtime and gets rate-limited for fifteen minutes. The client
 * shows the countdown the server actually gave it, and refuses to call the API inside that
 * window — but the server verdict is the authority and its `rate_limited` error is its own
 * screen (see otp-step.tsx). This module never invents a shorter wait than the server said.
 */

export interface CooldownState {
  /** Server-issued wait after the last send, in seconds. */
  readonly cooldownSec: number;
  /** Epoch ms of the last accepted send. */
  readonly lastSentAtMs: number;
  /** When a server-side rate limit expires (0 = not limited). Authoritative over cooldownSec. */
  readonly blockedUntilMs: number;
}

export type ResendDecision =
  | { readonly action: 'allow' }
  | { readonly action: 'wait'; readonly afterSec: number }
  | { readonly action: 'blocked'; readonly retryAfterSec: number };

export function initialCooldown(lastSentAtMs: number, cooldownSec: number): CooldownState {
  return { cooldownSec, lastSentAtMs, blockedUntilMs: 0 };
}

/** Pure: pass the live clock in, never read Date here, so tests can move time without timers. */
export function resendDecisionAt(state: CooldownState, nowMs: number): ResendDecision {
  if (state.blockedUntilMs > nowMs) {
    return { action: 'blocked', retryAfterSec: Math.ceil((state.blockedUntilMs - nowMs) / 1000) };
  }
  const elapsedSec = Math.floor((nowMs - state.lastSentAtMs) / 1000);
  const remaining = state.cooldownSec - elapsedSec;
  if (remaining > 0) return { action: 'wait', afterSec: remaining };
  return { action: 'allow' };
}

/**
 * A server `retryAfterSec` outranks the local cooldown, and a new send resets the local cooldown
 * from the server's fresh value. Keeping that ordering in one function is the point: two places
 * deciding "can I send again" is how a client starts lying about rate limits.
 */
export function applySend(state: CooldownState, sentAtMs: number, cooldownSec: number): CooldownState {
  return { cooldownSec, lastSentAtMs: sentAtMs, blockedUntilMs: 0 };
}

export function applyBlocked(state: CooldownState, retryAfterSec: number, nowMs: number): CooldownState {
  const blockedUntilMs = nowMs + retryAfterSec * 1000;
  return { ...state, blockedUntilMs: Math.max(blockedUntilMs, state.blockedUntilMs) };
}

/** `95s → "1:35"`, `40s → "0:40"` — a countdown a thumb on a minibus can read. */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
