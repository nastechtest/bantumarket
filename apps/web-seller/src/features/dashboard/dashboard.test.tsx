import { describe, expect, it } from 'bun:test';
import './test-dom.js';
import { DashboardPage } from './dashboard-page.js';
import { ActionCentre } from './action-centre.js';
import { EMPTY_DASHBOARD, FIXTURE_ATTENTION, createDashboardFixture } from './api/fixtures.js';
import { byTestId, click, flush, mount, text, win } from './test-dom.js';
import { nextStepFor } from './next-step.js';

const NOW = new Date('2026-10-16T14:00:00+02:00');

describe('dashboard page states', () => {
  it('renders a loading state before the snapshot arrives', async () => {
    const transport = createDashboardFixture({ latencyMs: 50 });
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    expect(text(m.container)).toContain('Loading your dashboard');
    await m.flush();
    m.unmount();
  });

  it('renders the seller greeting, tier label and next step on success', async () => {
    const transport = createDashboardFixture();
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    await m.flush();
    const body = text(m.container);
    expect(body).toContain('Good afternoon, Pieter.');
    expect(body).toContain('ID checked');
    expect(text(byTestId(m.container, 'next-step'))).toContain('Fix the bank details');
    m.unmount();
  });

  it('shows the error state, then recovers when retried', async () => {
    const transport = createDashboardFixture({ failuresBeforeSuccess: 1 });
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    await m.flush();
    const alert = byTestId(m.container, 'dashboard-error');
    expect(alert).not.toBeNull();
    expect(text(alert)).toContain('could not load');
    expect(transport.loads()).toBe(1);

    await click(Array.from(m.container.querySelectorAll('button')).find((b) => text(b) === 'Try again') ?? null);
    await m.flush();
    expect(byTestId(m.container, 'dashboard-error')).toBeNull();
    expect(text(m.container)).toContain('Good afternoon, Pieter.');
    expect(transport.loads()).toBe(2);
    m.unmount();
  });

  it('a seller with zero listings gets a real first step, not an empty table', async () => {
    const transport = createDashboardFixture({ snapshot: EMPTY_DASHBOARD });
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    await m.flush();
    expect(byTestId(m.container, 'getting-started')).not.toBeNull();
    expect(text(byTestId(m.container, 'next-step'))).toContain('List your first watch');
    expect(text(m.container)).not.toContain('Nothing needs you today');
    m.unmount();
  });

  it('an in-review listing says what is being waited on and by whom', async () => {
    const transport = createDashboardFixture();
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    await m.flush();
    const wait = byTestId(m.container, 'review-wait');
    expect(text(wait)).toContain('Tudor Black Bay 58');
    expect(text(wait)).toContain('NasTech review');
    m.unmount();
  });

  it('renders money through the formatter and never as raw cents', async () => {
    const transport = createDashboardFixture();
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    await m.flush();
    expect(text(m.container)).toContain('R4,200');
    expect(text(m.container)).not.toContain('420000');
    m.unmount();
  });

  it('never claims a tier or a check was "verified" or "guaranteed"', async () => {
    const transport = createDashboardFixture();
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    await m.flush();
    expect(text(m.container)).not.toMatch(/verified|guaranteed?/i);
    m.unmount();
  });

  it('warns that the view is stale when the browser goes offline', async () => {
    const transport = createDashboardFixture();
    const m = mount(<DashboardPage transport={transport} now={NOW} />);
    await m.flush();
    await flush(() => win.dispatchEvent(new win.Event('offline')));
    expect(text(m.container)).toContain('You are offline.');
    await flush(() => win.dispatchEvent(new win.Event('online')));
    expect(text(m.container)).not.toContain('You are offline.');
    m.unmount();
  });
});

describe('action centre component', () => {
  it('renders the money-blocking item first even when it is older than a question', () => {
    const m = mount(<ActionCentre items={FIXTURE_ATTENTION} />);
    const kinds = Array.from(m.container.querySelectorAll('[data-kind]')).map((n) => n.getAttribute('data-kind'));
    // The fixture's handover blocks R4,200 and the failed payout R3,890: both are money-blocking
    // (bucket 0), so the larger amount leads. What must never happen is a question leading.
    expect(kinds[0]).toBe('handover_unscheduled');
    expect(kinds.indexOf('handover_unscheduled')).toBeLessThan(kinds.indexOf('question_unanswered'));
    expect(text(m.container)).toContain('Waiting on us');
    m.unmount();
  });

  it('renders an honest empty state rather than a blank panel', () => {
    const m = mount(<ActionCentre items={[]} />);
    expect(text(m.container)).toContain('Nothing is waiting on you');
    m.unmount();
  });
});

describe('next step selection', () => {
  it('a failed payout outranks an unscheduled handover on the same screen', () => {
    const step = nextStepFor({
      ...EMPTY_DASHBOARD,
      payout: { ...EMPTY_DASHBOARD.payout, status: 'failed', failedReason: 'Account closed.' },
      attention: FIXTURE_ATTENTION,
    });
    expect(step?.id).toBe('fix-payout');
  });

  it('a draft outranks a new-listing prompt and links back into the wizard', () => {
    const step = nextStepFor({
      ...EMPTY_DASHBOARD,
      firstListingAt: '2026-10-02T00:00:00+02:00',
      listings: { byStage: { ...EMPTY_DASHBOARD.listings.byStage, draft: 1 }, recent: [] },
    });
    expect(step?.id).toBe('finish-draft');
    expect(step?.href).toBe('/listings/new');
  });

  it('returns null when nothing is outstanding', () => {
    const step = nextStepFor({
      ...EMPTY_DASHBOARD,
      firstListingAt: '2026-10-02T00:00:00+02:00',
      listings: { byStage: { ...EMPTY_DASHBOARD.listings.byStage, live: 1 }, recent: [] },
    });
    expect(step).toBeNull();
  });
});
