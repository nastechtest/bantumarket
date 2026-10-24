/**
 * End-to-end behaviour of the checkout page: the flow the brief demands a buyer can complete with
 * zero WebGL — review (server numbers) → method (server-offered only) → confirm (one tap, one
 * intent) → processing as a STATE → done as the ledger's answer. Plus the refusals: an ineligible
 * listing explains itself in buyer language, and no card number/CVV field exists anywhere.
 */

import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { CheckoutPage } from './checkout-page.js';
import { createFixtureBackend } from './api/fixtures.js';
import { createCheckoutApi } from './api/checkout-transport.js';
import { CheckoutIntents, createMemoryNonceStore } from './idempotency.js';
import { createAbandonStore } from './abandon.js';

let lastRoot: Root | null = null;

afterEach(() => {
  if (lastRoot !== null) {
    act(() => lastRoot!.unmount());
    lastRoot = null;
  }
  document.body.innerHTML = '';
});

interface Mount {
  readonly host: HTMLElement;
  readonly doc: Document;
}

function mount(orderId: string, backend: ReturnType<typeof createFixtureBackend>): Mount {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const intents = new CheckoutIntents({ store: createMemoryNonceStore() });
  const root = createRoot(host);
  lastRoot = root;
  act(() => {
    root.render(
      <CheckoutPage
        orderId={orderId}
        api={{ transport: backend.transport }}
        intents={intents}
        abandon={createAbandonStore()}
      />,
    );
  });
  return { host, doc: document };
}

function byTestId(doc: Document, id: string): Element | null {
  return doc.querySelector(`[data-testid="${id}"]`);
}

function textOf(el: Element | null): string {
  return el?.textContent ?? '';
}

async function flush(backend: ReturnType<typeof createFixtureBackend>): Promise<void> {
  await act(async () => {
    await backend.settleAll();
  });
}

async function click(el: Element | null): Promise<void> {
  expect(el, 'element to click must exist').not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe('checkout flow', () => {
  it('arrives on the review screen showing the ledger’s own numbers, not a placeholder', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_01', backend);
    await flush(backend);

    const review = byTestId(doc, 'step-review');
    expect(review).not.toBeNull();
    expect(textOf(review)).toContain('Seiko');
    expect(textOf(review)).toContain('R4,200'); // item price AND total (no fees) — verbatim from the wire
    expect(textOf(review)).toContain('R420'); // commission, seller-side, server-issued
    expect(textOf(review)).toContain('10%');
    expect(byTestId(doc, 'fee-rows-empty')).not.toBeNull(); // no fees → no invented fee rows
  });

  it('a quote WITH a buyer fee renders the fee row and the server total, both verbatim', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_02', backend);
    await flush(backend);
    expect(textOf(byTestId(doc, 'fee-rows'))).toContain('Insured delivery');
    expect(textOf(byTestId(doc, 'fee-rows'))).toContain('R89');
    expect(textOf(byTestId(doc, 'total-row'))).toContain('R3,278');
  });

  it('walks review → method → confirm → pay → paid, and the pay tap creates exactly one intent', async () => {
    const backend = createFixtureBackend({ intentFirstResponseDelayMs: 0, webhookDelayMs: 5 });
    const { doc } = mount('ord_01', backend);
    await flush(backend);

    await click(byTestId(doc, 'review-continue'));
    expect(byTestId(doc, 'step-method')).not.toBeNull();

    await click(byTestId(doc, 'method-option-CARD'));
    expect(byTestId(doc, 'step-confirm')).not.toBeNull();
    expect(textOf(byTestId(doc, 'confirm-amount'))).toContain('R4,200');

    await click(byTestId(doc, 'confirm-pay'));
    // Processing is a STATE the buyer can read, not a spinner: the POST answered
    // “awaiting_provider”, so the screen says it is confirming and refuses to claim an outcome.
    expect(byTestId(doc, 'step-processing')).not.toBeNull();
    expect(textOf(byTestId(doc, 'processing-truth'))).toContain('provider');
    await flush(backend); // the webhook books PAID server-side while the screen sits open
    await click(byTestId(doc, 'processing-recheck'));

    const done = byTestId(doc, 'step-done');
    expect(done).not.toBeNull();
    expect(done?.getAttribute('data-order-status')).toBe('PAID');
    expect(textOf(byTestId(doc, 'done-status'))).toContain('You paid');
    expect(backend.createdIntentKeys()).toHaveLength(1);
  });

  it('the card panel has no card-number, expiry or CVV field — only the receipt email', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_01', backend);
    await flush(backend);
    await click(byTestId(doc, 'review-continue'));
    await click(byTestId(doc, 'method-option-CARD'));

    const card = byTestId(doc, 'method-card');
    expect(card).not.toBeNull();
    const inputs = card!.querySelectorAll('input');
    expect(inputs.length).toBe(1); // the optional receipt email — nothing else
    expect(inputs[0]?.getAttribute('autocomplete')).toBe('email');
    expect(textOf(card)).toContain('bank’s secure page');
    expect(card!.innerHTML.toLowerCase()).not.toMatch(/card number|cvv|cvc|expiry|pan/);
  });

  it('instant EFT demands a valid SA mobile before the tap can fire an intent', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_01', backend);
    await flush(backend);
    await click(byTestId(doc, 'review-continue'));
    await click(byTestId(doc, 'method-option-INSTANT_EFT'));

    await click(byTestId(doc, 'confirm-pay'));
    // validation blocks: no POST ever happened
    expect(backend.postLog()).toHaveLength(0);
    const mobileError = byTestId(doc, 'method-instant-eft')!.querySelector('[role="alert"]');
    expect(mobileError).not.toBeNull();
  });

  it('cash on handover reserves without charging — the order stays AWAITING_PAYMENT and says so', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_01', backend);
    await flush(backend);
    await click(byTestId(doc, 'review-continue'));
    await click(byTestId(doc, 'method-option-CASH_ON_HANDOVER'));
    await click(byTestId(doc, 'confirm-pay'));
    await flush(backend);

    expect(backend.statusOf('ord_01')).toBe('AWAITING_PAYMENT'); // ledger truth: no cash webhook
    const done = byTestId(doc, 'step-done');
    expect(done).not.toBeNull();
    expect(done?.getAttribute('data-order-status')).toBe('AWAITING_PAYMENT');
    expect(textOf(done)).toContain('cash');
    expect(textOf(byTestId(doc, 'method-status')).toLowerCase()).not.toContain('paid');
  });

  it('a listing the server marks ineligible gets a reason and a next step, not a generic error', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_03', backend); // LISTING_NOT_ACTIVE
    await flush(backend);

    const unavailable = byTestId(doc, 'checkout-unavailable');
    expect(unavailable).not.toBeNull();
    expect(textOf(unavailable)).toContain('no longer');
    expect(textOf(byTestId(doc, 'unavailable-next-step'))).toContain('Browse');
    // And critically: no way to pay it — no confirm screen, no intent.
    expect(byTestId(doc, 'step-confirm')).toBeNull();
    expect(backend.postLog()).toHaveLength(0);
  });

  it('a self-sale is refused with the ledger’s actual reason', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_04', backend); // SELF_SALE
    await flush(backend);
    expect(textOf(byTestId(doc, 'checkout-unavailable'))).toContain('own listing');
  });

  it('a price view that contradicts the ledger is blocked, not rounded', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_05', backend); // buyerTotal < itemPrice: impossible per CreateOrder
    await flush(backend);
    const unavailable = byTestId(doc, 'checkout-unavailable');
    expect(unavailable).not.toBeNull();
    expect(textOf(unavailable)).toContain('below');
  });

  it('arriving on an already-paid order shows the TRUE state from the transport, never payment again', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_06', backend);
    await flush(backend);
    expect(byTestId(doc, 'step-done')?.getAttribute('data-order-status')).toBe('PAID');
    expect(byTestId(doc, 'review-continue')).toBeNull();
    expect(backend.postLog()).toHaveLength(0);
  });

  it('a refund-initiated order is rendered as money-not-yet-moved', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_07', backend);
    await flush(backend);
    const done = byTestId(doc, 'step-done');
    expect(done?.getAttribute('data-order-status')).toBe('REFUND_PENDING');
    expect(textOf(done)).toContain('has not moved');
    expect(textOf(done)).not.toMatch(/refunded? \(/i);
  });

  it('an unknown orderId fails honestly (notFound), with support copy — not a blank screen', async () => {
    const backend = createFixtureBackend();
    const { doc } = mount('ord_missing', backend);
    await flush(backend);
    const err = byTestId(doc, 'checkout-error');
    expect(err).not.toBeNull();
    expect(textOf(err)).toContain('could not find');
  });

  it('remounting mid-confirm keeps the same payment intent key across page objects (registry outlives the root)', async () => {
    const backend = createFixtureBackend();
    const intents = new CheckoutIntents({ store: createMemoryNonceStore() });
    const rootA = createRoot(document.body.appendChild(document.createElement('div')));
    act(() => {
      rootA.render(<CheckoutPage orderId="ord_01" api={{ transport: backend.transport }} intents={intents} abandon={createAbandonStore()} />);
    });
    await flush(backend);
    const keyA = intents.keyForPayment('ord_01');
    act(() => rootA.unmount());

    const rootB = createRoot(document.body.appendChild(document.createElement('div')));
    act(() => {
      rootB.render(<CheckoutPage orderId="ord_01" api={{ transport: backend.transport }} intents={intents} abandon={createAbandonStore()} />);
    });
    await flush(backend);
    const keyB = intents.keyForPayment('ord_01');
    act(() => rootB.unmount());
    document.body.innerHTML = '';

    expect(keyA).toBe(keyB);
  });
});
