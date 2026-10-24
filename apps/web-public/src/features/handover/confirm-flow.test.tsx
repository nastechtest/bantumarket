import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { win } from './dom-setup.js';
import { HandoverPage } from './handover-page.js';
import { createFixtureHandoverTransport, FIXTURE_PIN } from './api/fixtures.js';
import type { HandoverScenario } from './api/fixtures.js';

/**
 * The confirm-handover flow, tested as behaviour: what a wrong code does to the attempt
 * counter, what the second tap does to the network, and what the screen says once this side
 * has sworn. These are the money-adjacent properties; everything else here is decoration.
 */

let root: Root | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

// Dynamic so react-dom is not initialised before './dom-setup.js' has installed the jsdom globals.
const { Simulate } = await import('react-dom/test-utils');

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  // The act() is inside the helper, not at the call site: typing is a state update, and an
  // unflushed one makes the next assertion read the screen from before the keystroke.
  act(() => {
    setter.call(el, value);
    // `Simulate.change`, not a dispatched `input`: this runtime's react-dom decides native input
    // events are unsupported and then ignores every one of them, so a dispatched event types into a
    // DOM node the component never reads.
    Simulate.change(el);
  });
}

function setCheckbox(el: HTMLInputElement) {
  // jsdom's activation behaviour toggles `checked` and fires input+change for a dispatched
  // click; setting the property by hand first would double-toggle it back to false.
  if (el.checked) return;
  act(() => {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  });
}

function click(el: Element) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
}

async function mount(scenario: HandoverScenario, role: 'buyer' | 'seller' = 'buyer') {
  const transport = createFixtureHandoverTransport({ scenario, actingRole: role });
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<HandoverPage orderId="ord_03" role={role} transport={transport} />);
  });
  const doc = document;
  const form = () => doc.querySelector('[data-testid="confirm-handover"]') as HTMLElement;
  const pinInput = () => doc.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
  const ack = () => doc.querySelector('form input[type="checkbox"]') as HTMLInputElement;
  const submit = () => doc.querySelector('form button[type="submit"]') as HTMLButtonElement;
  return { doc, transport, form, pinInput, ack, submit };
}

describe('explicit, not implicit', () => {
  it('the button is dead until the party has ticked the sentence that names what they swear', async () => {
    const { form, submit, pinInput } = await mount('open');
    expect(form()).not.toBeNull();
    expect(submit().disabled).toBe(true);
    setInput(pinInput(), FIXTURE_PIN);
    expect(submit().disabled).toBe(true); // PIN alone is not enough
    setCheckbox(form()!.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await act(async () => undefined);
    expect(submit().disabled).toBe(false);
    // And the confirmation is a button, not a swipe or an auto-fire.
    expect(submit().textContent).toContain('Confirm the exchange');
  });

  it('the copy in front of the button states that this confirms presence, and that completion — not this press — releases money', async () => {
    const { form } = await mount('open');
    const text = form()!.textContent!;
    expect(text).toContain('I am at the meeting place');
    expect(text).toContain('released to the seller');
    expect(text).toContain('when the order completes');
    expect(text.toLowerCase()).toContain('does not pay anyone by itself');
  });
});

describe('wrong PINs burn attempts, exactly like HandoverToken', () => {
  it('one wrong code → four attempts of five named on screen', async () => {
    const { form, pinInput, ack, submit, doc, transport } = await mount('open');
    setInput(pinInput(), '000000');
    setCheckbox(ack());
    await act(async () => click(submit()));
    const line = doc.querySelector('[data-testid="wrong-pin"]')!;
    expect(line.textContent).toContain('4 of 5 attempts left');
    expect(transport.presentCalls).toBe(1);
  });

  it('five wrong codes through the UI lock the token, and the locked screen says money did not move', async () => {
    const m = await mount('open');
    for (let i = 0; i < 5; i++) {
      setInput(m.pinInput(), '000000');
      setCheckbox(m.ack());
      await act(async () => click(m.submit()));
    }
    expect(m.transport.presentCalls).toBe(5);
    const locked = m.doc.querySelector('[data-testid="confirm-locked"]');
    expect(locked).not.toBeNull();
    expect(locked!.textContent).toContain('No money has moved');
    expect(locked!.textContent).toContain('Reissue');
    expect(m.doc.querySelector('[data-testid="confirm-handover"]')).toBeNull();
  });
});

describe('idempotence — the presentation cannot double-fire', () => {
  it('a frantic double tap sends exactly one presentation', async () => {
    const { pinInput, ack, submit, transport } = await mount('open');
    setInput(pinInput(), FIXTURE_PIN);
    setCheckbox(ack());
    await act(async () => {
      click(submit());
      click(submit());
      click(submit());
    });
    expect(transport.presentCalls).toBe(1);
  });

  it('after this side confirms, the field is gone and a re-read cannot ask again', async () => {
    const { doc, transport, pinInput, ack, submit } = await mount('open', 'buyer');
    setInput(pinInput(), FIXTURE_PIN);
    setCheckbox(ack());
    await act(async () => click(submit()));
    expect(transport.presentCalls).toBe(1);
    const panel = doc.querySelector('[data-testid="confirm-done-side"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('You have confirmed this handover');
    expect(panel!.textContent).toContain('the seller');
    expect(doc.querySelector('[data-testid="confirm-handover"]')).toBeNull();
    // The other side can still do their own half.
    const sellerView = createFixtureHandoverTransport({ scenario: 'buyer_presented', actingRole: 'seller' });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const r2 = createRoot(host);
    await act(async () => {
      r2.render(<HandoverPage orderId="ord_03" role="seller" transport={sellerView} />);
    });
    expect(host.querySelector('[data-testid="confirm-handover"]')).not.toBeNull();
    act(() => r2.unmount());
  });

  it('a seller completing the pair flips the page to the completion panel, not a payment claim', async () => {
    const { doc } = await mount('buyer_presented', 'seller');
    const pin = doc.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    const box = doc.querySelector('form input[type="checkbox"]') as HTMLInputElement;
    const button = doc.querySelector('form button[type="submit"]') as HTMLButtonElement;
    setInput(pin, FIXTURE_PIN);
    setCheckbox(box);
    await act(async () => click(button));
    const done = doc.querySelector('[data-testid="handover-complete"]')!;
    expect(done).not.toBeNull();
    expect(done.textContent).toContain('released to the seller when the order completes');
  });
});
