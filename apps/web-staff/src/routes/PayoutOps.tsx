import { useState } from 'react';
import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { PayoutBatch } from '../features/operations/fixtures-money.js';
import { PAYOUT_BATCHES, PAYOUT_REVIEW } from '../features/operations/fixtures-money.js';
import type { Column, Tone } from '../features/operations/ui.js';
import {
  Amount,
  DataTable,
  Intro,
  MaskedAccount,
  Reference,
  StatStrip,
  StatusTag,
  TwoColumn,
} from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import {
  ActionButton,
  CheckRow,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  Section,
  SelectField,
} from '../shell/ui.js';

function statusTone(status: string): Tone {
  if (status === 'Released') return 'positive';
  if (status === 'Failed') return 'negative';
  if (status === 'On hold') return 'caution';
  return 'info';
}

const COLUMNS: readonly Column<PayoutBatch>[] = [
  {
    key: 'batch',
    header: 'Batch',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span>{row.seller}</span>
        <Reference>{row.id}</Reference>
      </div>
    ),
  },
  { key: 'destination', header: 'Destination', render: (row) => <MaskedAccount bank={row.bank} last4={row.last4} /> },
  { key: 'amount', header: 'Amount', align: 'end', render: (row) => <Amount cents={row.amountCents} /> },
  { key: 'orders', header: 'Orders', align: 'end', render: (row) => String(row.orderCount) },
  { key: 'requested', header: 'Requested (UTC)', render: (row) => formatInstant(row.requestedAt) },
  { key: 'prepared', header: 'Prepared by', render: (row) => row.preparedBy },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
];

const APPROVER_OPTIONS = [
  { value: '', label: 'Select a second approver' },
  { value: 'lindiwe', label: 'Lindiwe Mahlangu — Finance preparer' },
  { value: 'naledi', label: 'Naledi Khumalo — Finance checker' },
  { value: 'thabo', label: 'Thabo Molefe — Finance checker' },
] as const;

/** Route '/payouts', class 'critical'. Payout batches under maker-checker. */
export default function PayoutOps({ route }: { route: RouteDef }) {
  const batch = PAYOUT_REVIEW;
  const [approver, setApprover] = useState('');
  const [checked, setChecked] = useState(false);
  const sameAsPreparer = approver === 'lindiwe';
  const canRelease = approver !== '' && !sameAsPreparer && checked;

  return (
    <>
      <PageHeader
        title={route.label}
        kicker="Finance control"
        actions={<StatusTag tone="negative">Critical surface</StatusTag>}
      />
      <Intro>
        Payouts run under maker-checker: one finance user prepares a batch, a different finance user releases it. This
        screen shows the destination masked, the orders behind the amount, and the approval that is still missing.
      </Intro>
      <StatStrip
        items={[
          { label: 'Awaiting release', value: '3' },
          { label: 'Value awaiting release', value: 'R68,650' },
          { label: 'On hold', value: '1', tone: 'caution' },
          { label: 'Failed', value: '1', tone: 'negative' },
        ]}
      />

      <Section title="Batches">
        <DataTable
          caption="Payout batches and their current state"
          columns={COLUMNS}
          rows={PAYOUT_BATCHES}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title="Release review">
        <TwoColumn>
          <Panel title="Batch">
            <KeyValue
              items={[
                { term: 'Batch', detail: <Reference>{batch.id}</Reference> },
                { term: 'Seller', detail: `${batch.seller} — ${batch.sellerName}` },
                { term: 'Amount', detail: <Amount cents={batch.amountCents} /> },
                { term: 'Orders', detail: String(batch.orderCount) },
                { term: 'Destination', detail: <MaskedAccount bank={batch.bank} last4={batch.last4} /> },
                { term: 'Destination verified', detail: formatInstant(batch.verifiedAt) },
                { term: 'Requested', detail: formatInstant(batch.requestedAt) },
                { term: 'Prepared by', detail: `${batch.preparedBy} (${batch.preparedByRole})` },
                { term: 'Prepared at', detail: formatInstant(batch.preparedAt) },
              ]}
            />
            <p style={{ margin: 0, color: tokens.text.secondary }}>{batch.holdNote}</p>
          </Panel>

          <Panel title="Second approval" tone="caution">
            <SelectField
              id="payout-approver"
              label="Second approver"
              value={approver}
              options={APPROVER_OPTIONS}
              onChange={setApprover}
              hint="The approver must be a different finance user from the preparer."
            />
            <CheckRow
              id="payout-release-confirm"
              label={`I have checked the destination and the ${batch.orderCount} orders behind this batch.`}
              checked={checked}
              onChange={setChecked}
            />
            {sameAsPreparer ? (
              <Notice tone="negative" title="The preparer cannot release this batch">
                Lindiwe Mahlangu prepared {batch.id}. A second finance user must approve it, even if the preparer also
                holds the release capability.
              </Notice>
            ) : null}
            <ActionButton
              label="Release batch"
              onClick={() => undefined}
              disabled={!canRelease}
              disabledReason={
                approver === ''
                  ? 'Choose a second approver first.'
                  : sameAsPreparer
                    ? 'The preparer cannot approve their own batch.'
                    : !checked
                      ? 'Confirm that you checked the destination and the orders.'
                      : undefined
              }
            />
            <p style={{ margin: 0, color: tokens.text.secondary }}>
              Release is recorded against both finance users with the batch id, amount and UTC time. The transport
              refuses a release where preparer and approver are the same account.
            </p>
          </Panel>
        </TwoColumn>
      </Section>

      <Notice tone="info" title="Sensitive data">
        A payout destination is never shown in full. Bank details are verified against the account holder before a
        batch is prepared, and the console keeps only the institution and last four digits on screen.
      </Notice>
    </>
  );
}
