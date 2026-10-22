import { describe, expect, it } from 'vitest';
import { IdempotencyKeys, generateIdempotencyKey, orderIntent } from '../src/idempotency.js';
import { ApiError } from '../src/errors.js';
import { createOrdersApi } from '../src/orders.js';
import { money } from '@nastech/api-contracts';
import { FakeTransport, orderViewFixture } from './fake-transport.js';

const noSleep = { sleep: async () => {} };

describe('IdempotencyKeys', () => {
  it('returns the identical key for every call of one intent', () => {
    const keys = new IdempotencyKeys();
    const first = keys.keyForIntent('order:lst_1:tap-7');
    expect(keys.keyForIntent('order:lst_1:tap-7')).toBe(first);
    expect(keys.keyForIntent('order:lst_1:tap-7')).toBe(first);
  });

  it('gives a fresh key after the intent is released, and a different key to a different intent', () => {
    const keys = new IdempotencyKeys();
    const first = keys.keyForIntent('intent-a');
    keys.releaseIntent('intent-a');
    expect(keys.keyForIntent('intent-a')).not.toBe(first);
    expect(keys.keyForIntent('intent-b')).not.toBe(first);
  });

  it('generates unique keys across many calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateIdempotencyKey());
    expect(seen.size).toBe(500);
  });

  it('scopes intents per listing and tap, so a second deliberate tap is a new intent', () => {
    expect(orderIntent('lst_1', 1)).not.toBe(orderIntent('lst_1', 2));
    expect(orderIntent('lst_1', 1)).toBe(orderIntent('lst_1', 1));
  });
});

describe('idempotency through the order API', () => {
  it('reuses the same Idempotency-Key across a transport retry (double-tap stays one order)', async () => {
    const transport = new FakeTransport();
    transport
      .respond(() => {
        throw new ApiError({ kind: 'network' });
      })
      .respond(() => orderViewFixture());
    const keys = new IdempotencyKeys();
    const orders = createOrdersApi(transport, keys, noSleep);

    const order = await orders.createOrder({
      listingId: 'lst_1',
      buyerTotal: money(352000),
      intent: orderIntent('lst_1', 1),
    });

    expect(order.id).toBe('ord_1');
    expect(transport.calls.length).toBe(2);
    const key1 = transport.idempotencyKeyOf(0);
    const key2 = transport.idempotencyKeyOf(1);
    expect(key1).toBeDefined();
    // THE invariant: retry of one intent must never mint a fresh key.
    expect(key2).toBe(key1);
  });

  it('keeps the key when retries are exhausted, so the next manual retry is still one intent', async () => {
    const transport = new FakeTransport();
    transport.alwaysFailsWith(new ApiError({ kind: 'network' }));
    const keys = new IdempotencyKeys();
    const orders = createOrdersApi(transport, keys, noSleep);
    const intent = orderIntent('lst_1', 1);

    let failed = false;
    try {
      await orders.createOrder({ listingId: 'lst_1', buyerTotal: money(352000), intent });
    } catch (error) {
      failed = error instanceof ApiError && error.kind === 'network';
    }
    expect(failed).toBe(true);
    expect(keys.pendingIntents()).toEqual([intent]);

    const originalKey = transport.idempotencyKeyOf(0);
    transport.respond(() => orderViewFixture());
    await orders.createOrder({ listingId: 'lst_1', buyerTotal: money(352000), intent });
    expect(transport.idempotencyKeyOf(transport.calls.length - 1)).toBe(originalKey);
  });

  it('releases the intent on success so a later tap with a new nonce gets a new key', async () => {
    const transport = new FakeTransport();
    transport.respond(() => orderViewFixture());
    const keys = new IdempotencyKeys();
    const orders = createOrdersApi(transport, keys, noSleep);

    await orders.createOrder({ listingId: 'lst_1', buyerTotal: money(352000), intent: orderIntent('lst_1', 1) });
    await orders.createOrder({ listingId: 'lst_1', buyerTotal: money(352000), intent: orderIntent('lst_1', 2) });

    expect(keys.pendingIntents()).toEqual([]);
    expect(transport.idempotencyKeyOf(0)).not.toBe(transport.idempotencyKeyOf(1));
  });

  it('retires a validation-rejected intent: a fixed re-submit is a new intent with a new key', async () => {
    const transport = new FakeTransport();
    transport
      .alwaysFailsWith(new ApiError({ kind: 'validation', httpStatus: 422 }))
      .respond(() => orderViewFixture());
    const keys = new IdempotencyKeys();
    const orders = createOrdersApi(transport, keys, noSleep);
    const intent = orderIntent('lst_1', 1);

    let rejected = false;
    try {
      await orders.createOrder({ listingId: 'lst_1', buyerTotal: money(1), intent });
    } catch (error) {
      rejected = error instanceof ApiError && error.kind === 'validation';
    }
    expect(rejected).toBe(true);
    expect(keys.pendingIntents()).toEqual([]);

    await orders.createOrder({ listingId: 'lst_1', buyerTotal: money(352000), intent });
    expect(transport.idempotencyKeyOf(0)).not.toBe(transport.idempotencyKeyOf(1));
  });
});
