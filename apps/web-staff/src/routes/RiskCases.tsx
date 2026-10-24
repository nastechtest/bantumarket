import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { RiskRow } from '../features/operations/fixtures-cases.js';
import { RISK_ROWS } from '../features/operations/fixtures-cases.js';
import type { Column, Tone } from '../features/operations/ui.js';
import { DataTable, Intro, Reference, StatStrip, StatusTag } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import { Notice, PageHeader, Section } from '../shell/ui.js';

function scoreTone(score: number): Tone {
  if (score >= 75) return 'negative';
  if (score >= 50) return 'caution';
  return 'neutral';
}

function statusTone(status: string): Tone {
  if (status === 'Cleared') return 'positive';
  if (status === 'New') return 'caution';
  if (status === 'Hold placed') return 'negative';
  return 'info';
}

const COLUMNS: readonly Column<RiskRow>[] = [
  {
    key: 'case',
    header: 'Case',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <a href={`/risk/${row.id}`} style={{ color: tokens.action.default, fontWeight: 600 }}>
          {row.subject}
        </a>
        <Reference>{row.id}</Reference>
      </div>
    ),
  },
  {
    key: 'signals',
    header: 'Signals',
    render: (row) => (
      <ul style={{ margin: 0, paddingLeft: '1rem' }}>
        {row.signals.map((signal) => (
          <li key={signal}>{signal}</li>
        ))}
      </ul>
    ),
  },
  { key: 'score', header: 'Risk score', align: 'end', render: (row) => <StatusTag tone={scoreTone(row.score)}>{row.score}</StatusTag> },
  { key: 'opened', header: 'Opened (UTC)', render: (row) => formatInstant(row.openedAt) },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
  { key: 'assignee', header: 'Assignee', render: (row) => row.assignee },
];

/** Route '/risk', class 'app'. The risk desk's case list. */
export default function RiskCases({ route }: { route: RouteDef }) {
  return (
    <>
      <PageHeader title={route.label} kicker="Marketplace integrity" />
      <Intro>
        Risk cases group signals that need a human decision: payout destination changes, sudden listing velocity,
        chargebacks and shared devices. A score is a reading, not a verdict — the analyst records the action.
      </Intro>
      <StatStrip
        items={[
          { label: 'Open cases', value: '12' },
          { label: 'High risk', value: '2', tone: 'negative' },
          { label: 'Holds placed', value: '5', tone: 'caution' },
          { label: 'Cleared this week', value: '19', tone: 'positive' },
        ]}
      />
      <Section title="Cases">
        <DataTable
          caption="Risk cases, highest score first"
          columns={COLUMNS}
          rows={RISK_ROWS}
          rowKey={(row) => row.id}
        />
      </Section>
      <Notice tone="info" title="Reading a score">
        A high score opens a case; it does not freeze an account by itself. A hold, a selling limit or a suspension is
        an action with a named analyst, a reason and an automated expiry where one applies.
      </Notice>
    </>
  );
}
