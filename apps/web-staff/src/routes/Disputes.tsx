import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { DisputeRow } from '../features/operations/fixtures-cases.js';
import { DISPUTE_ROWS } from '../features/operations/fixtures-cases.js';
import type { Column, Tone } from '../features/operations/ui.js';
import { Amount, DataTable, Intro, Reference, StatStrip, StatusTag } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import { Notice, PageHeader, Section } from '../shell/ui.js';

function statusTone(status: string): Tone {
  if (status === 'Refunded' || status === 'Closed — returned') return 'positive';
  if (status === 'Under review') return 'info';
  if (status === 'Refund pending') return 'caution';
  return 'neutral';
}

function slaTone(sla: string): Tone {
  if (sla.includes('overdue')) return 'negative';
  if (sla === 'Met') return 'positive';
  return 'neutral';
}

const COLUMNS: readonly Column<DisputeRow>[] = [
  {
    key: 'case',
    header: 'Case',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <a href={`/disputes/${row.id}`} style={{ color: tokens.action.default, fontWeight: 600 }}>
          {row.reason}
        </a>
        <Reference>{row.id}</Reference>
      </div>
    ),
  },
  { key: 'order', header: 'Order', render: (row) => <Reference>{row.orderId}</Reference> },
  { key: 'buyer', header: 'Buyer', render: (row) => row.buyer },
  { key: 'seller', header: 'Seller', render: (row) => row.seller },
  { key: 'amount', header: 'Amount in dispute', align: 'end', render: (row) => <Amount cents={row.amountCents} /> },
  { key: 'opened', header: 'Opened (UTC)', render: (row) => formatInstant(row.openedAt) },
  { key: 'sla', header: 'Response', render: (row) => <StatusTag tone={slaTone(row.sla)}>{row.sla}</StatusTag> },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
];

/** Route '/disputes', class 'app'. The dispute desk's list of open and recently closed cases. */
export default function Disputes({ route }: { route: RouteDef }) {
  return (
    <>
      <PageHeader title={route.label} kicker="Buyer protection" />
      <Intro>
        A dispute holds the seller’s payout while the desk reads both sides. Open a case to see the order, the evidence
        and the decision options. Money moves only when a resolver records a decision.
      </Intro>
      <StatStrip
        items={[
          { label: 'Open cases', value: '18' },
          { label: 'Past response time', value: '2', tone: 'negative' },
          { label: 'Held in escrow', value: 'R64,300' },
          { label: 'Closed this week', value: '31', tone: 'positive' },
        ]}
      />
      <Section title="Cases">
        <DataTable
          caption="Dispute cases, newest first"
          columns={COLUMNS}
          rows={DISPUTE_ROWS}
          rowKey={(row) => row.id}
        />
      </Section>
      <Notice tone="info" title="What this screen shows">
        Case files use marketplace handles and order references. Card numbers, one-time codes and full bank account
        numbers never appear here; a payout destination is shown as institution and last four digits only.
      </Notice>
    </>
  );
}
