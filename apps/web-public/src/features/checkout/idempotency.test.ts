/**
 * The key discipline of `idempotency.ts`: one key per user intent; reused across retries,
 * back-navigation and remount; a fresh key ONLY after the server confirms a terminal failure.
 * These are the unit-level teeth of the double-charge guarantee.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CheckoutIntents, createMemoryNonceStore, paymentIntentId } from './idempotency.js';

const ORDER = 'ord_01';
let intents: CheckoutIntents;

beforeEach(() => {
  intents = new CheckoutIntents({ store: createMemoryNonceStore() });
});

describe('CheckoutIntents', () => {
  it('first call mints, every later call of the same intent returns the identical key', () => {
    const first = intents.keyForPayment(ORDER);
    for (let i = 0; i < 25; i++) {
      expect(intents.keyForPayment(ORDER)).toBe(first);
    }
  });

  it('different orders are different intents', () => {
    const a = intents.keyForPayment('ord_a');
    const b = intents.keyForPayment('ord_b');
    expect(a).not.toBe(b);
  });

  it('the nonce survives a registry rebuild — a remount with the same store resumes the SAME intent', () => {
    const store = createMemoryNonceStore();
    const before = new CheckoutIntents({ store });
    const key = before.keyForPayment(ORDER);

    // Simulated remount: fresh registry object reading the persistent nonce store.
    const after = new CheckoutIntents({ store });
    expect(after.keyForPayment(ORDER)).toBe(key);
    expect(after.currentNonce(ORDER)).toBe(0);
  });

  it('beginNewAttemptAfterConfirmedFailure advances the nonce exactly once and yields a fresh key', () => {
    const original = intents.keyForPayment(ORDER);
    const fresh = intents.beginNewAttemptAfterConfirmedFailure(ORDER);
    expect(fresh).not.toBe(original);
    expect(intents.currentNonce(ORDER)).toBe(1);
    // …and is then stable across ITS retries, like any intent.
    expect(intents.keyForPayment(ORDER)).toBe(fresh);
    expect(intents.keyForPayment(ORDER)).toBe(fresh);
    expect(intents.currentNonce(ORDER)).toBe(1);
  });

  it('settlePayment and releaseOnHardFailure retire keys without touching the nonce', () => {
    const key = intents.keyForPayment(ORDER);
    intents.settlePayment(ORDER);
    // Retired: the next call mints fresh — but this path is only reached after captured/no_charge
    // or a hard-invalid, where a replay of the old key would be a duplicate of a DEAD intent.
    const nextKey = intents.keyForPayment(ORDER);
    expect(nextKey).not.toBe(key);
    expect(intents.currentNonce(ORDER)).toBe(0);
  });

  it('resetOrder forgets persistence: a new browser session on a fresh device starts a new intent', () => {
    const key = intents.keyForPayment(ORDER);
    intents.resetOrder(ORDER);
    const nextSessionKey = intents.keyForPayment(ORDER);
    expect(nextSessionKey).not.toBe(key);
    expect(intents.currentNonce(ORDER)).toBe(0);
  });

  it('intent ids are namespaced per order and nonce — no accidental collision across orders', () => {
    expect(paymentIntentId(ORDER, 0)).toBe('pay:ord_01:0');
    expect(paymentIntentId(ORDER, 3)).toBe('pay:ord_01:3');
    expect(paymentIntentId(ORDER, 0)).not.toBe(paymentIntentId('ord_02', 0));
  });

  it('pendingIntents reflects live keys only', () => {
    intents.keyForPayment(ORDER);
    expect(intents.pendingIntents()).toEqual([paymentIntentId(ORDER, 0)]);
    intents.settlePayment(ORDER);
    expect(intents.pendingIntents()).toEqual([]);
  });
});
