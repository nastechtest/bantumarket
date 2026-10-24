import { useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { ReconciliationBreak } from '../features/operations/fixtures-money.js';
import { RECONCILIATION_BREAKS } from '../features/operations/fixtures-money.js';
import type { Column } from '../features/operations/ui.js';
import { Amount, DataTable, Intro, Reference, StatStrip, StatusTag } from '../features/operations/ui.js';
import { ActionButton, CheckRow, KeyValue, Notice, PageHeader, Panel, Section, TextArea } from '../shell/ui.js';

function breakTone(status: string): 'negative' | 'caution' | 'neutral' {
  if (status === 'Missing settlement' || status === 'Duplicate settlement') return 'negative';
  if (status === 'Matched late') return 'neutral';
  return 'caution';
}

const COLUMNS: readonly Column<ReconciliationBreak>[] = [
  { key: 'break', header: 'Break', render: (row) => <Reference>{row.id}</Reference> },
  {
    key: 'provider',
    header: 'Provider reference',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span>{row.provider}</span>
        <Reference>{row.providerRef}</Reference>
      </div>
    ),
  },
  { key: 'order', header: 'Order', render: (row) => <Reference>{row.orderId}</Reference> },
  { key: 'expected', header: 'Ledger expected', align: 'end', render: (row) => <Amount cents={row.expectedCents} /> },
  { key: 'captured', header: 'Provider captured', align: 'end', render: (row) => <Amount cents={row.capturedCents} /> },
  {
    key: 'variance',
    header: 'Variance',
    align: 'end',
    render: (row) => (
      <span style={{ color: row.varianceCents < 0 ? raw.color.signalNegative : tokens.text.primary }}>
        <Amount cents={row.varianceCents} />
      </span>
    ),
  },
  { key: 'age', header: 'Age', align: 'end', render: (row) => row.age },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={breakTone(row.status)}>{row.status}</StatusTag> },
];

/** Route '/reconciliation', class 'critical'. Ledger breaks that need a finance decision. */
export default function Reconciliation({ route }: { route: RouteDef }) {
  const [exportReason, setExportReason] = useState('');
  const [exportConfirmed, setExportConfirmed] = useState(false);
  const canExport = exportReason.trim().length >= 12 && exportConfirmed;

  return (
    <>
      <PageHeader
        title={route.label}
        kicker="Ledger control"
        actions={<StatusTag tone="negative">Critical surface</StatusTag>}
      />
      <Intro>
        Reconciliation compares the order ledger with what each payment provider actually settled. A break is not a
        loss until someone checks it; this screen names the variance and stops there. Nothing on this page can move
        money.
      </Intro>
      <StatStrip
        items={[
          { label: 'Settlements matched', value: '1,284' },
          { label: 'Open breaks', value: '6', tone: 'caution' },
          { label: 'Net variance', value: '-R2,615', tone: 'negative' },
          { label: 'Providers', value: '4' },
        ]}
      />

      <Section title="Run details">
        <Panel>
          <KeyValue
            items={[
              { term: 'Window', detail: '21 October 2026 00:00 — 22 October 2026 08:00 UTC' },
              { term: 'Ledger snapshot', detail: <Reference>ledger_2026_10_22_0800</Reference> },
              { term: 'Provider feeds', detail: 'Peach, PayFast, PayGate and Yoco — all four received' },
              { term: 'Run by', detail: 'Finance operations (automated), checked by Lindiwe Mahlangu' },
            ]}
          />
        </Panel>
      </Section>

      <Section title="Ledger breaks">
        <DataTable
          caption="Settlement breaks for the current reconciliation window"
          columns={COLUMNS}
          rows={RECONCILIATION_BREAKS}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title="Export">
        <Panel>
          <TextArea
            id="reconciliation-export-reason"
            label="Reason for the export"
            value={exportReason}
            onChange={setExportReason}
            rows={3}
            hint="At least 12 characters. The reason is written to the audit trail with your account."
          />
          <CheckRow
            id="reconciliation-export-confirm"
            label="I confirm this export is for reconciliation only and contains no cardholder data."
            checked={exportConfirmed}
            onChange={setExportConfirmed}
          />
          <ActionButton
            label="Export breaks (CSV)"
            tone="secondary"
            onClick={() => undefined}
            disabled={!canExport}
            disabledReason={
              !exportConfirmed
                ? 'Confirm the export is for reconciliation only.'
                : exportReason.trim().length < 12
                  ? 'Give a reason of at least 12 characters.'
                  : undefined
            }
          />
        </Panel>
        <Notice tone="info" title="What the export contains">
          Provider references, order ids, integer-cent amounts and timestamps. It never contains a card number,
          cardholder name, one-time code or full bank account number.
        </Notice>
      </Section>
    </>
  );
}
