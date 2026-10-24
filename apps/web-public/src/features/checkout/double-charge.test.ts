/**
 * THE load-bearing deliverable: one click → one intent.
 *
 * Scenario (the brief, verbatim in transport terms): a transport that succeeds on the server while
 * the client "times out", then every way a buyer can make the app present that payment again —
 * a second submit, a retry after the timeout, a back-navigation, and a full remount — must produce
 * EXACTLY ONE payment intent server-side. The assertion is on the fake backend's ledger
 * (`createdIntentKeys`), not on component internals, because the guarantee is a server fact.
 *
 * Runs against the real session core over the real transport seam (`execute` + timeout), so the
 * timeout is a genuine client deadline, not a mocked feeling.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createFixtureBackend } from './api/fixtures.js';
import type { FixtureBackend } from './api/fixtures.js';
import { createCheckoutApi } from './api/checkout-transport.js';
import { createCheckoutSession } from './use-checkout.js';
import type { CheckoutSession } from './use-checkout.js';
import { CheckoutIntents, createMemoryNonceStore } from './idempotency.js';
import { createAbandonStore } from './abandon.js';

const ORDER = 'ord_01';

interface Harness {
  readonly backend: FixtureBackend;
  readonly intents: CheckoutIntents;
  buildSession: () => CheckoutSession;
}

function harness(): Harness {
  // intentFirstResponseDelayMs (200) >> api timeoutMs (20): the server does the work and then
  // answers into a conversation nobody is having — the client has already given up.
  const backend = createFixtureBackend({ intentFirstResponseDelayMs: 200, webhookDelayMs: 30 });
  const intents = new CheckoutIntents({ store: createMemoryNonceStore() });
  const abandon = createAbandonStore();
  const buildSession = () =>
    createCheckoutSession({
      api: createCheckoutApi({ transport: backend.transport, timeoutMs: 20 }),
      intents,
      abandon,
    });
  return { backend, intents, buildSession };
}

async function toConfirm(session: CheckoutSession): Promise<void> {
  await session.load(ORDER);
  session.goMethod();
  session.chooseMethod('CARD');
}

let h: Harness;

beforeEach(() => {
  h = harness();
});

describe('double-charge: one click → one intent', () => {
  it('a double tap sends ONE POST: the second tap is absorbed by the synchronous reentry lock', async () => {
    const session = h.buildSession();
    await toConfirm(session);

    const first = session.pay();
    const second = session.pay();
    const [a, b] = await Promise.all([first, second]);

    expect(a.sent).toBe(true);
    expect(b.sent).toBe(false);
    expect(b.reason).toBe('not-confirmable');
    expect(h.backend.createdIntentKeys()).toHaveLength(1);

    // The POST that did go out times out (fixture delays its answer past the client deadline)…
    await session.recheck();
    await h.backend.settleAll();
    await session.recheck();
    expect(session.state().phase).toBe('outcome');
    expect(session.state().view?.order.status).toBe('PAID');
    expect(h.backend.createdIntentKeys()).toHaveLength(1);
  });

  it('timeout on the server-succeeded request → retry reuses the SAME key and creates nothing new', async () => {
    const session = h.buildSession();
    await toConfirm(session);

    await session.pay(); // POST goes out; client times out at 20ms while the server processes.
    expect(session.state().phase).toBe('resolving');
    // The timeout window must NOT claim an outcome: no "failed", no "paid" — resolving copy only.
    expect(session.state().error?.action).toBe('resolve_from_server');
    expect(h.backend.statusOf(ORDER)).toBe('AWAITING_PAYMENT'); // webhook hasn't landed yet

    // Buyer (or a sloppy test driver) re-presents the payment after the timeout. Back to confirm
    // and tap again: this is a repeat of the SAME intent, so it carries the SAME key.
    session.back();
    session.goMethod();
    session.chooseMethod('CARD');
    const result = await session.pay();
    expect(result.sent).toBe(true);

    const deduped = h.backend.postLog().filter((p) => !p.created);
    expect(deduped.length).toBeGreaterThanOrEqual(1); // the repeat POST was answered as a duplicate
    expect(h.backend.createdIntentKeys()).toHaveLength(1); // …and created nothing
    const keys = new Set(h.backend.postLog().map((p) => p.key));
    expect(keys.size).toBe(1); // every POST for this intent carried ONE identical key

    await h.backend.settleAll();
    await session.recheck();
    expect(session.state().view?.order.status).toBe('PAID');
  });

  it('back-navigation and re-entry to confirm never mint a new key', async () => {
    const session = h.buildSession();
    await toConfirm(session);

    const keyA = h.intents.keyForPayment(ORDER);
    session.back();
    session.goMethod();
    session.chooseMethod('CARD');
    const keyB = h.intents.keyForPayment(ORDER);
    session.back();
    session.back();
    session.goMethod();
    session.chooseMethod('CARD');
    const keyC = h.intents.keyForPayment(ORDER);

    expect(keyA).toBe(keyB);
    expect(keyB).toBe(keyC);
    expect(h.intents.pendingIntents()).toHaveLength(1);
  });

  it('a remount mid-flight (new session, same persistent registry) re-presents the SAME intent — one payment', async () => {
    const dying = h.buildSession();
    await toConfirm(dying);
    await dying.pay(); // timed out client-side; server has the intent.
    expect(dying.state().phase).toBe('resolving');

    // The browser "dies": session disposed, page remounted — a NEW session object, same tab store.
    dying.dispose();
    const returned = h.buildSession();
    await returned.load(ORDER);

    // Truth first: the returning visit resolves the state from the transport. The intent exists
    // server-side and the capture webhook is in flight → resolving, and the banner says why.
    expect(returned.state().phase).toBe('resolving');
    expect(returned.state().returnedFromAbandon).toBe(true);

    // If the returning buyer is impatient and re-presents (driven back to confirm, as the UI
    // allows), the key is the persisted one → the server dedupes → still ONE intent ever.
    returned.back();
    returned.goMethod();
    returned.chooseMethod('CARD');
    await returned.pay();
    expect(h.backend.createdIntentKeys()).toHaveLength(1);

    await h.backend.settleAll();
    await returned.recheck();
    expect(returned.state().phase).toBe('outcome');
    expect(returned.state().view?.order.status).toBe('PAID');
  });

  it('the NEXT visit after a dead browser shows PAID from the transport, not a guessed failed', async () => {
    const dying = h.buildSession();
    await toConfirm(dying);
    await dying.pay(); // client timeout; server captured.
    dying.markAbandoned();
    dying.dispose();

    await h.backend.settleAll(); // the webhook books PAID while nobody is watching.

    const returned = h.buildSession();
    await returned.load(ORDER);
    expect(returned.state().view?.order.status).toBe('PAID');
    expect(returned.state().phase).toBe('outcome');
    expect(h.backend.createdIntentKeys()).toHaveLength(1);
  });

  it('a NEW intent is minted only when the server says the old one terminally failed', async () => {
    const declined = createFixtureBackend({ outcome: 'failed', intentFirstResponseDelayMs: 0 });
    const intents = new CheckoutIntents({ store: createMemoryNonceStore() });
    const session = createCheckoutSession({
      api: createCheckoutApi({ transport: declined.transport, timeoutMs: 4000 }),
      intents,
      abandon: createAbandonStore(),
    });

    await session.load(ORDER);
    session.goMethod();
    session.chooseMethod('CARD');
    await session.pay();
    expect(session.state().phase).toBe('outcome'); // failed is terminal truth; show it
    expect(declined.createdIntentKeys()).toHaveLength(1);

    // Re-presenting after a CONFIRMED failure is a deliberate new intent — fresh key, second intent.
    const outcome = await session.payAgainAfterFailure();
    expect(outcome.sent).toBe(true);
    expect(declined.createdIntentKeys()).toHaveLength(2);
    const keys = declined.createdIntentKeys();
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('a retry while state is UNKNOWN is refused a new key and a second charge', async () => {
    const session = h.buildSession();
    await toConfirm(session);
    await session.pay(); // timeout → resolving (unknown)
    expect(session.state().phase).toBe('resolving');

    // payAgainAfterFailure is the "start fresh" door; in the unknown window it must stay SHUT:
    // the server has not said `failed`, so a fresh key would be a second capture.
    const outcome = await session.payAgainAfterFailure();
    expect(outcome.sent).toBe(false);
    expect(h.backend.createdIntentKeys()).toHaveLength(1);
  });
});
