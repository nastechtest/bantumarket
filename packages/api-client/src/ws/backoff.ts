/**
 * Bounded jittered backoff, shared by the HTTP retry middleware and the WebSocket reconnect policy.
 *
 * It lives under `ws/` because that is where an unbounded retry loop does the most damage — a
 * marketplace app reconnecting every second against a warm failover drains a Johannesburg LTE
 * handset and multiplies the thundering herd when one edge node comes back. The same generator is
 * what `http/middleware/retry.ts` needs, and two slightly different exponential curves in one
 * client is how "the ceiling" stops meaning anything, so there is exactly one implementation.
 *
 * Three properties the tests hold it to:
 *   - the delay for attempt *n* is capped by `min(ceilingMs, baseMs * factor^(n-1))` — a ceiling is
 *     a ceiling, not a suggestion, and attempt 30 must not ask for an hour;
 *   - the jitter spreads retries (`full`), so N phones that lost the cell tower at the same moment
 *     do not all come back on the same tick;
 *   - the sequence is reproducible when `rng` is, because a test of a randomised delay that cannot
 *     be pinned is a test of a coin flip.
 */

export type JitterMode = 'full' | 'equal' | 'none';

export interface BackoffPolicy {
  readonly baseMs: number;
  readonly factor: number;
  readonly ceilingMs: number;
  readonly jitter: JitterMode;
  /** Total elapsed budget after which the caller stops trying. `undefined` means "no limit". */
  readonly maxTotalMs?: number;
}

export const DEFAULT_HTTP_BACKOFF: BackoffPolicy = {
  baseMs: 200,
  factor: 2,
  ceilingMs: 4000,
  jitter: 'full',
  maxTotalMs: 10_000,
};

/**
 * Websocket reconnects are slower and longer-lived than a retried GET: a buyer who locks the phone
 * and comes back ten minutes later should find a connected socket, and the app should not have made
 * forty attempts to the edge in the meantime.
 */
export const DEFAULT_WS_BACKOFF: BackoffPolicy = {
  baseMs: 500,
  factor: 2,
  ceilingMs: 30_000,
  jitter: 'full',
  maxTotalMs: 10 * 60_000,
};

/** A connection that stayed up this long is treated as healthy and the attempt counter resets. */
export const STABLE_CONNECTION_MS = 60_000;

export function defaultRng(): number {
  return Math.random();
}

/** The unbiased maximum delay for an attempt, before jitter. Attempts are 1-based. */
export function attemptCapMs(policy: BackoffPolicy, attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  // `Math.pow` overflows to Infinity for a long sequence; the ceiling must hold regardless.
  const raw = policy.baseMs * Math.pow(policy.factor, exponent);
  return Math.min(policy.ceilingMs, Number.isFinite(raw) ? raw : policy.ceilingMs);
}

/**
 * The delay for one attempt. `rng` is called once and must return [0, 1); a caller that injects a
 * constant 1 gets the cap, a constant 0 gets the floor.
 */
export function computeDelayMs(policy: BackoffPolicy, attempt: number, rng: () => number = defaultRng): number {
  const cap = attemptCapMs(policy, attempt);
  if (policy.jitter === 'none') return cap;
  const draw = clamp01(rng());
  if (policy.jitter === 'equal') {
    const half = cap / 2;
    return Math.round(half + draw * half);
  }
  return Math.round(draw * cap);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value >= 1) return 0.999999;
  return value;
}

/** The whole curve, for assertions and for a "retry in ~Ns" line. */
export function backoffSequence(policy: BackoffPolicy, attempts: number, rng: () => number = defaultRng): number[] {
  const out: number[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) out.push(computeDelayMs(policy, attempt, rng));
  return out;
}

/**
 * Whether to try again given how long the caller has already been failing. Elapsed is measured by
 * the caller's own clock so a policy that sleeps 30 s cannot be counted as 1 s of budget.
 */
export function withinBudget(policy: BackoffPolicy, elapsedMs: number, nextDelayMs: number): boolean {
  if (policy.maxTotalMs === undefined) return true;
  return elapsedMs + nextDelayMs <= policy.maxTotalMs;
}

/**
 * The reconnect decision for a socket that has been failing: give up only once the budget is spent,
 * and never with a delay above the ceiling. `attempt` is 1-based, matching the HTTP side.
 */
export interface BackoffStep {
  readonly delayMs: number;
  readonly giveUp: boolean;
}

export function nextStep(
  policy: BackoffPolicy,
  attempt: number,
  elapsedMs: number,
  rng: () => number = defaultRng,
): BackoffStep {
  const cap = attemptCapMs(policy, attempt);
  const delay = Math.min(cap, computeDelayMs(policy, attempt, rng));
  return { delayMs: delay, giveUp: !withinBudget(policy, elapsedMs, delay) };
}

/**
 * Whether a healthy connection should reset the attempt counter. Without this, one long outage
 * followed by a day of normal use leaves the socket reconnecting at the ceiling forever.
 */
export function shouldResetAttempts(connectedForMs: number, stableMs = STABLE_CONNECTION_MS): boolean {
  return connectedForMs >= stableMs;
}
