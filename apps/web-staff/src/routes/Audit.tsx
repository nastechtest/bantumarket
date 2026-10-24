import type { RouteDef } from '../router.js';
import type { AuditEntry } from '../features/operations/fixtures-money.js';
import { AUDIT_ENTRIES } from '../features/operations/fixtures-money.js';
import type { Column } from '../features/operations/ui.js';
import { DataTable, Intro, Reference, StatStrip, StatusTag } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import { Notice, PageHeader, Section } from '../shell/ui.js';

const COLUMNS: readonly Column<AuditEntry>[] = [
  { key: 'when', header: 'When (UTC)', render: (row) => formatInstant(row.at) },
  {
    key: 'who',
    header: 'Who',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span>{row.actor}</span>
        <Reference>{row.role}</Reference>
      </div>
    ),
  },
  { key: 'action', header: 'Action', render: (row) => <Reference>{row.action}</Reference> },
  { key: 'target', header: 'Target', render: (row) => <Reference>{row.target}</Reference> },
  { key: 'why', header: 'Why', render: (row) => row.reason },
  {
    key: 'outcome',
    header: 'Outcome',
    render: (row) => (
      <StatusTag tone={row.outcome === 'allowed' ? 'positive' : 'negative'}>{row.outcome}</StatusTag>
    ),
  },
];

/** Route '/audit', class 'critical'. The attributed trail of staff actions. */
export default function Audit({ route }: { route: RouteDef }) {
  return (
    <>
      <PageHeader
        title={route.label}
        kicker="Accountability"
        actions={<StatusTag tone="negative">Critical surface</StatusTag>}
      />
      <Intro>
        Every staff action that changes a listing, a case, a payout or a privacy request writes a row here. The row
        names the person, the role the server granted, the target, the reason and the UTC time. Entries are append-only
        and cannot be edited from this console.
      </Intro>
      <StatStrip
        items={[
          { label: 'Entries today', value: '48' },
          { label: 'Refused actions', value: '3', tone: 'negative' },
          { label: 'After-hours entries', value: '2', tone: 'caution' },
          { label: 'Money actions', value: '11' },
        ]}
      />

      <Section title="Trail">
        <DataTable
          caption="Audit entries for 22 October 2026, newest first"
          columns={COLUMNS}
          rows={AUDIT_ENTRIES}
          rowKey={(row) => row.id}
        />
      </Section>

      <Notice tone="info" title="What is deliberately absent">
        Audit entries never include passwords, one-time codes, card numbers, full bank account numbers or document
        images. A refusal is recorded with the rule that refused it, not with the secret that was typed.
      </Notice>
    </>
  );
}
