import { TIER_LABELS } from '@nastech/api-contracts';
import { formatDuration, metricRows, VANITY_METRICS } from './metrics-that-are-not-vanity.js';
import type { DashboardSnapshot, DashboardTransport } from './api/dashboard-transport.js';
import { createDashboardFixture, DEMO_DASHBOARD } from './api/fixtures.js';
import { greeting, useDashboard } from './use-dashboard.js';
import { ActionCentre } from './action-centre.js';
import { CaptureStatus } from './capture-status.js';
import { GettingStarted } from './getting-started.js';
import { ListingStatusCards } from './listing-status-cards.js';
import { nextStepFor } from './next-step.js';
import { PendingPayout } from './pending-payout.js';
import { SalesSummary } from './sales-summary.js';
import { EmptyBlock, ErrorBlock, LoadingBlock, Muted, OfflineBanner, Panel } from './ui.js';

export interface DashboardPageProps {
  transport?: DashboardTransport;
  /** Test/demo injection: render this snapshot instead of loading. */
  snapshot?: DashboardSnapshot;
  now?: Date;
}

function SellerHeading({ snapshot, now }: { snapshot: DashboardSnapshot; now: Date }) {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: '0.875rem' }} data-testid="dashboard-greeting">
          {greeting(now)}, {snapshot.seller.displayName}.
        </p>
        <h1 style={{ marginTop: '4px' }}>Today</h1>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--ink-500)' }}>Your seller tier</span>
        <p style={{ margin: 0, fontWeight: 600 }}>{TIER_LABELS[snapshot.seller.tier]}</p>
        <a href="/onboarding" style={{ fontSize: '0.8125rem' }}>
          What this means
        </a>
      </div>
    </header>
  );
}

function FirstStep({ snapshot }: { snapshot: DashboardSnapshot }) {
  const step = nextStepFor(snapshot);
  if (step === null) return null;
  return (
    <section
      aria-labelledby="next-step-title"
      data-testid="next-step"
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--ink-100)',
        borderLeft: '4px solid var(--accent)',
        borderRadius: '14px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <h2 id="next-step-title" style={{ fontSize: '1.25rem' }}>
        {step.title}
      </h2>
      <p style={{ margin: 0 }}>{step.body}</p>
      {step.learnMore ? <Muted>{step.learnMore}</Muted> : null}
      <div>
        <a className="button" href={step.href}>
          {step.cta}
        </a>
      </div>
    </section>
  );
}

function FunnelMetrics({ snapshot }: { snapshot: DashboardSnapshot }) {
  const rows = metricRows(snapshot);
  return (
    <Panel title="How long things took" subtitle="The only timing numbers we measure. Views are not evidence and are not shown." id="metrics">
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', margin: 0 }}>
        {rows.map((row) => (
          <div key={row.key}>
            <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-500)' }}>{row.label}</dt>
            <dd style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 600 }} data-testid={`metric-${row.key}`}>
              {formatDuration(row.milliseconds)}
            </dd>
            <dd style={{ margin: 0, color: 'var(--ink-500)', fontSize: '0.8125rem' }}>{row.detail}</dd>
          </div>
        ))}
      </dl>
      <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: '0.8125rem' }}>
        Deliberately absent: {VANITY_METRICS.map((m) => m.key).join(', ')}. {VANITY_METRICS[0].reason}
      </p>
    </Panel>
  );
}

function SnapshotView({ snapshot, now }: { snapshot: DashboardSnapshot; now: Date }) {
  const isNewSeller = snapshot.firstListingAt === null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '16px' }}>
      <OfflineBanner />
      <SellerHeading snapshot={snapshot} now={now} />
      <FirstStep snapshot={snapshot} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isNewSeller ? <GettingStarted /> : <ActionCentre items={snapshot.attention} />}
          <ListingStatusCards byStage={snapshot.listings.byStage} recent={snapshot.listings.recent} />
          <SalesSummary orders={snapshot.orders.recent} waitingOnYou={snapshot.orders.waitingOnYou} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <PendingPayout payout={snapshot.payout} />
          <CaptureStatus capture={snapshot.capture} />
        </div>
      </div>

      <FunnelMetrics snapshot={snapshot} />

      {snapshot.attention.length === 0 && !isNewSeller ? (
        <EmptyBlock
          title="Nothing needs you today"
          body="We will show an order, a question or a review decision here the moment it needs you."
          action={<a className="button secondary" href="/listings">Review your listings</a>}
        />
      ) : null}
    </div>
  );
}

function ConnectedDashboard({ transport, now }: { transport: DashboardTransport; now: Date }) {
  const { state, reload } = useDashboard(transport);
  if (state.status === 'loading') return <LoadingBlock />;
  if (state.status === 'error') return <ErrorBlock message={state.error} onRetry={reload} />;
  return <SnapshotView snapshot={state.snapshot} now={now} />;
}

export function DashboardPage({ transport, snapshot, now = new Date() }: DashboardPageProps) {
  if (snapshot !== undefined) return <SnapshotView snapshot={snapshot} now={now} />;
  // The connected page is a child component so the hook is never called conditionally.
  return <ConnectedDashboard transport={transport ?? DEMO_TRANSPORT} now={now} />;
}

/** One fixture instance for the app; tests always inject their own. */
const DEMO_TRANSPORT: DashboardTransport = createDashboardFixture({ snapshot: DEMO_DASHBOARD });
