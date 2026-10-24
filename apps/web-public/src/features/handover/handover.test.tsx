import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { HandoverPage } from './handover-page.js';
import { createFixtureHandoverTransport } from './api/fixtures.js';
import type { HandoverScenario } from './api/fixtures.js';

/**
 * Page-level behaviour per handover scenario. These assert what a party at a meeting point
 * actually SEES in each state — the money lines, the window line, which panel replaced the PIN
 * field — because that visibility is the product. `confirm-flow.test.tsx` covers the act of
 * confirming; this file covers everything around it.
 */

let root: Root | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function mount(scenario: HandoverScenario, role: 'buyer' | 'seller' = 'buyer') {
  const transport = createFixtureHandoverTransport({ scenario, actingRole: role });
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<HandoverPage orderId="ord_03" role={role} transport={transport} />);
  });
  return { doc: document, transport };
}

const q = (doc: Document, testId: string) => doc.querySelector(`[data-testid="${testId}"]`);

describe('handover page states', () => {
  it('unscheduled order shows the booking flow, not a dead PIN box', async () => {
    const { doc } = await mount('unscheduled');
    expect(q(doc, 'schedule')).not.toBeNull();
    expect(q(doc, 'venue-picker')).not.toBeNull();
    expect(q(doc, 'time-slots')).not.toBeNull();
    expect(q(doc, 'confirm-handover')).toBeNull();
    expect(q(doc, 'schedule')!.textContent).toContain('held by NasTech');
  });

  it('open window shows the window bar with SAST times and the confirm form', async () => {
    const { doc } = await mount('open');
    const bar = q(doc, 'window-bar');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('Window open');
    expect(bar!.textContent).toContain('SAST');
    expect(q(doc, 'confirm-handover')).not.toBeNull();
  });

  it('expired window replaces the PIN field with the reissue path and states the money is still held', async () => {
    const { doc } = await mount('expired');
    expect(q(doc, 'confirm-expired')).not.toBeNull();
    expect(q(doc, 'confirm-handover')).toBeNull();
    expect(q(doc, 'confirm-expired')!.textContent).toContain('still held');
    expect(q(doc, 'confirm-expired')!.textContent).toContain('Reissue');
  });

  it('locked token offers only reissue, never another guess', async () => {
    const { doc } = await mount('locked');
    expect(q(doc, 'confirm-locked')).not.toBeNull();
    expect(q(doc, 'confirm-locked')!.textContent).toContain('No money has moved');
    expect(q(doc, 'confirm-handover')).toBeNull();
  });

  it('both-confirmed shows the completion panel with release-at-completion wording — not “paid now”', async () => {
    const { doc } = await mount('complete');
    const done = q(doc, 'handover-complete');
    expect(done).not.toBeNull();
    expect(done!.textContent).toContain('released to the seller when the order completes');
    expect(done!.textContent).not.toMatch(/has been paid out now/i);
    expect(q(doc, 'confirm-handover')).toBeNull();
  });

  it('the meeting brief (bring-this + safety) is present and role-aware', async () => {
    const { doc } = await mount('open', 'seller');
    expect(q(doc, 'handover-extra')).not.toBeNull();
    const seller = q(doc, 'bring-this')!.textContent!;
    expect(seller).toContain('written condition disclosures');
    expect(seller).toContain('Bring this — as seller');

    act(() => root!.unmount());
    root = null;
    document.body.innerHTML = '';
    await mount('open', 'buyer');
    const buyer = q(doc, 'bring-this')!.textContent!;
    expect(buyer).toContain('written condition list');
    expect(buyer).toContain('Bring this — as buyer');
    // Role-aware means two different lists, not one list with a different heading: the buyer is
    // told to bring the card a refund returns to, the seller to bring the item as described.
    expect(buyer).not.toContain('Packaging, box or papers');
    expect(seller).not.toContain('bank card');
  });

  it('photo proof is labelled optional and never sits between the party and the confirm button', async () => {
    const { doc } = await mount('open');
    const photo = q(doc, 'photo-proof')!;
    expect(photo.textContent).toContain('optional');
    expect(photo.textContent).toContain('nothing about whether the watch works');
    // The confirm form is OUTSIDE and BEFORE the details block that folds the photo away.
    const form = q(doc, 'confirm-handover')!;
    const details = q(doc, 'handover-extra')!;
    const nodes = Array.from(details.parentElement!.children);
    expect(nodes.indexOf(form)).toBeLessThan(nodes.indexOf(details));
  });

  it('not-shown states the one next action and where the money is, in one breath', async () => {
    const { doc } = await mount('open');
    const ns = q(doc, 'not-shown')!;
    expect(ns.textContent).toContain('held by NasTech');
    expect(ns.textContent).toContain('when the refund settles');
    expect(ns.querySelectorAll('button').length).toBe(1);
    expect(ns.querySelector('button')!.textContent).toContain('Report they didn’t show');
  });

  it('reporting a no-show lands on the honest pending line: requested now, settled later', async () => {
    const { doc } = await mount('open');
    const button = q(doc, 'not-shown-report')!;
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const done = q(doc, 'not-shown-done')!;
    expect(done.textContent).toContain('refund request is now open');
    expect(done.textContent).toContain('has not settled yet');
  });
});
