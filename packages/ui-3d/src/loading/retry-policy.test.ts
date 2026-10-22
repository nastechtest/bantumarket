import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_RETRY,
  backoffDelayMs,
  isAbortError,
  isClientError,
  isRetryableError,
  isRetryableStatus,
  nextRetry,
  type RetryConfig,
} from './retry-policy.js';

function config(overrides: Partial<RetryConfig> = {}): RetryConfig {
  return { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1_000, random: () => 1, ...overrides };
}

describe('status classification', () => {
  it('never treats a 404 as retryable — the asset is not going to appear', () => {
    expect(isRetryableStatus(404)).toBe(false);
    expect(isClientError(404)).toBe(true);
  });

  it('refuses the whole 4xx family except the two codes that mean "later"', () => {
    for (const status of [400, 401, 403, 404, 405, 410, 422]) expect(isRetryableStatus(status)).toBe(false);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
  });

  it('retries the server’s own failures', () => {
    for (const status of [500, 502, 503, 504]) expect(isRetryableStatus(status)).toBe(true);
  });
});

describe('nextRetry', () => {
  it('does not retry a 404, and hands the buyer the static path instead', () => {
    const outcome = nextRetry(1, { status: 404 }, config());
    expect(outcome.retry).toBe(false);
    if (outcome.retry) throw new Error('404 must not retry');
    expect(outcome.reason).toBe('client-error');
    expect(outcome.staticPath).toBe(true);
  });

  it('does not retry a 403 either — a private manifest stays private', () => {
    const outcome = nextRetry(2, { status: 403 }, config());
    expect(outcome.retry).toBe(false);
  });

  it('retries a 503 while there is budget', () => {
    const outcome = nextRetry(1, { status: 503 }, config());
    expect(outcome.retry).toBe(true);
    if (!outcome.retry) throw new Error('expected retry');
    expect(outcome.delayMs).toBeGreaterThan(0);
  });

  it('stops after the declared number of attempts and hands over the static path', () => {
    const cfg = config({ maxAttempts: 3 });
    const third = nextRetry(3, { status: 503 }, cfg);
    expect(third.retry).toBe(false);
    if (third.retry) throw new Error('expected stop');
    expect(third.reason).toBe('attempts-exhausted');
    expect(third.staticPath).toBe(true);
  });

  it('treats a cancellation as final, never as a transient failure', () => {
    const aborted = new DOMException('cancelled', 'AbortError');
    expect(isAbortError(aborted)).toBe(true);
    expect(isRetryableError(aborted)).toBe(false);
    const outcome = nextRetry(1, { error: aborted }, config());
    expect(outcome.retry).toBe(false);
    if (outcome.retry) throw new Error('expected stop');
    expect(outcome.reason).toBe('aborted');
  });

  it('keeps the hard stop on every non-retryable path, so no exit is a spinner', () => {
    for (const input of [{ status: 404 }, { status: 409 }, { error: new DOMException('x', 'AbortError') }, { status: 500, attempt: 9 }]) {
      const outcome = nextRetry(9, input, config({ maxAttempts: 2 }));
      expect(outcome.retry).toBe(false);
      if (outcome.retry) continue;
      expect(outcome.staticPath).toBe(true);
    }
  });
});

describe('backoffDelayMs', () => {
  it('grows exponentially while it is under the cap', () => {
    const cfg = config({ random: () => 1 });
    expect(backoffDelayMs(1, cfg)).toBe(100);
    expect(backoffDelayMs(2, cfg)).toBe(200);
    expect(backoffDelayMs(3, cfg)).toBe(400);
  });

  it('never exceeds the declared ceiling', () => {
    const cfg = config({ random: () => 1, maxDelayMs: 500 });
    expect(backoffDelayMs(12, cfg)).toBe(500);
  });

  it('jitters across the whole window instead of synchronising the retry herd', () => {
    const low = backoffDelayMs(3, config({ random: () => 0 }));
    const high = backoffDelayMs(3, config({ random: () => 1 }));
    expect(low).toBe(0);
    expect(high).toBe(400);
  });

  it('clamps a broken random source rather than scheduling a negative wait', () => {
    expect(backoffDelayMs(2, config({ random: () => -5 }))).toBe(0);
    expect(backoffDelayMs(2, config({ random: () => Number.NaN }))).toBe(0);
  });

  it('defaults to a bounded three attempts', () => {
    expect(DEFAULT_RETRY.maxAttempts).toBe(3);
    expect(DEFAULT_RETRY.maxDelayMs).toBeGreaterThan(DEFAULT_RETRY.baseDelayMs);
  });
});
