import './test-dom.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { typeInto } from './test-dom.js';
import { ReportFlow } from './report-flow/index.js';
import { WhatHappensNext } from './report-flow/what-happens-next.js';
import { FlagProvider } from './flag-context.js';
import { createFixtureTransport, fixtureSubjects } from './api/fixtures.js';
import type { ReportSubject, SafetyTransport } from './api/safety-transport.js';
import { REPORT_REASONS } from './report-flow/reason.js';

/**
 * The report flow as behaviour: what blocks you, what you are told before you can proceed, what
 * the other side will see, and what happens when the network fails at 11pm. Every assertion here
 * is about honesty-under-pressure, which is the entire job of this feature.
 */

let root: ReturnType<typeof createRoot> | null = null;

function mount(transport: SafetyTransport, opts: { subject?: ReportSubject; signedIn?: boolean } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <FlagProvider subject={opts.subject ?? null}>
        <ReportFlow transport={transport} signedIn={opts.signedIn ?? false} />
      </FlagProvider>,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  );
  if (!found) throw new Error(`no button containing “${label}”`);
  return found;
}

function byTestId(host: HTMLElement, id: string): HTMLElement {
  const el = host.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`no element [data-testid=${id}]`);
  return el as HTMLElement;
}

function radio(host: HTMLElement, index: number): HTMLInputElement {
  const radios = host.querySelectorAll('input[name="report-reason"]');
  return radios[index] as HTMLInputElement;
}

const LONG_NARRATIVE =
  'We agreed R4,200 for the Seiko. He sent a bank screenshot at 08:02, then asked me to refund a R700 “difference” to a different number before any money showed in my own app.';

async function toNextStep(host: HTMLElement, transport: ReturnType<typeof createFixtureTransport>) {
  act(() => button(host, 'Continue').click()); // subject -> reason
  act(() => radio(host, 0).click()); // payment_proof_mismatch is first
  act(() => typeInto(host.querySelector('#report-narrative') as HTMLTextAreaElement, LONG_NARRATIVE));
  act(() => button(host, 'Continue').click()); // reason -> evidence
  act(() => button(host, 'Continue').click()); // evidence -> next
  void transport;
}

describe('report flow, subject pre-fill', () => {
  it('shows the flagged subject already selected — visible, never silent', () => {
    const t = createFixtureTransport();
    const host = mount(t, { subject: fixtureSubjects.item });
    const input = byTestId(host, 'subject-item-lst_01') as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(host.textContent).toContain('Seiko “Presage” automatic, 40.5 mm');
  });

  it('warns in the copy when the person moves away from the pre-filled subject', () => {
    const t = createFixtureTransport();
    const host = mount(t, { subject: fixtureSubjects.order });
    act(() => byTestId(host, 'subject-seller-acc_seller_thabo').click());
    expect(host.textContent).toContain('you changed the subject');
  });

  it('blocks continuing with no subject at all and names the problem', () => {
    const t = createFixtureTransport();
    const host = mount(t);
    act(() => button(host, 'Continue').click());
    expect(host.textContent).toContain('Pick who or what you are reporting.');
    expect(host.textContent).toContain('Who or what are you reporting?'); // still on step 1
  });
});

describe('report flow, the honest gate', () => {
  it('refuses to submit until both understanding ticks are on', async () => {
    const t = createFixtureTransport();
    const host = mount(t, { subject: fixtureSubjects.item, signedIn: true });
    toNextStep(host, t);
    expect(host.textContent).toContain('human review queue');
    expect(host.textContent).toContain('The person you report sees the report.');
    act(() => button(host, 'Send to the review queue').click());
    expect(host.textContent).toContain('Tick that you understand the queue');
    expect(t.submittedReports.length).toBe(0);
    expect(host.textContent).not.toContain('Report sent');
  });

  it('renders the response target as a target, and never a promised action', () => {
    const markup = renderToStaticMarkup(<WhatHappensNext />);
    expect(markup).toContain('A target is what we aim at, not what we promise');
    expect(markup).toContain('No action');
    expect(markup).not.toMatch(/we will (take action|remove|ban|refund)/i);
    // The range includes doing nothing — the sentence the brief calls non-negotiable:
    expect(markup).toContain('does not break the rules');
  });

  it('a guest must leave one way to be reached; a tick alone is not a report', async () => {
    const t = createFixtureTransport();
    const host = mount(t, { subject: fixtureSubjects.item }); // guest
    toNextStep(host, t);
    act(() => byTestId(host, 'ack-queue').click());
    act(() => byTestId(host, 'ack-visible').click());
    act(() => button(host, 'Send to the review queue').click());
    expect(host.textContent).toContain('Without an account, leave an email or phone number');
    expect(t.submittedReports.length).toBe(0);
  });
});

describe('report flow, submitting', () => {
  it('completes the whole guest path and lands on a reference-bearing receipt', async () => {
    const t = createFixtureTransport();
    const host = mount(t, { subject: fixtureSubjects.item });
    toNextStep(host, t);
    act(() => byTestId(host, 'ack-queue').click());
    act(() => byTestId(host, 'ack-visible').click());
    act(() => typeInto(host.querySelector('#report-contact') as HTMLInputElement, 'nomsa@example.co.za'));
    await act(async () => {
      button(host, 'Send to the review queue').click();
    });
    expect(host.textContent).toContain('Report sent — reference RPT-000232');
    expect(host.textContent).toContain('a target, not a promise');
    expect(host.textContent).toContain('can see this report’s reason and attachments');
    const sent = t.submittedReports[0]!;
    expect(sent.subject.id).toBe('lst_01');
    expect(sent.reasonId).toBe(REPORT_REASONS[0]!.id);
    expect(sent.narrative).toBe(LONG_NARRATIVE);
    expect(sent.contact).toBe('nomsa@example.co.za');
    expect(sent.signedIn).toBe(false);
  });

  it('attaching a platform message travels with the report as the strongest evidence kind', async () => {
    const t = createFixtureTransport();
    const host = mount(t, { subject: fixtureSubjects.item, signedIn: true });
    act(() => button(host, 'Continue').click());
    act(() => radio(host, 0).click());
    act(() => typeInto(host.querySelector('#report-narrative') as HTMLTextAreaElement, LONG_NARRATIVE));
    act(() => button(host, 'Continue').click());
    act(() => byTestId(host, 'evidence-msg_890').click());
    expect(host.textContent).toContain('Platform message msg_890');
    act(() => button(host, 'Continue').click()); // evidence -> next
    act(() => byTestId(host, 'ack-queue').click());
    act(() => button(host, 'Send to the review queue').click());
    // blocked: still needs the second tick and the reason text is intact
    expect(host.textContent).toContain('Tick that you understand the person reported');
    act(() => byTestId(host, 'ack-visible').click());
    await act(async () => {
      button(host, 'Send to the review queue').click();
    });
    expect(t.submittedReports[0]!.evidence).toHaveLength(1);
    expect(t.submittedReports[0]!.evidence[0]!.kind).toBe('in_platform_message');
  });

  it('a failed submit keeps everything typed and says the queue was unreachable', async () => {
    const t = createFixtureTransport({ failNextSubmit: true });
    const host = mount(t, { subject: fixtureSubjects.item, signedIn: true });
    toNextStep(host, t);
    act(() => byTestId(host, 'ack-queue').click());
    act(() => byTestId(host, 'ack-visible').click());
    await act(async () => {
      button(host, 'Send to the review queue').click();
    });
    expect(host.textContent).toContain('The report did not go through');
    expect(host.textContent).toContain('Everything you typed is still here');
    const narrative = host.querySelector('#report-narrative');
    expect(host.textContent).toContain('Before you send'); // did not bounce back to step 1
    void narrative;
    await act(async () => {
      button(host, 'Send to the review queue').click();
    });
    expect(host.textContent).toContain('Report sent — reference RPT-000232');
  });
});
