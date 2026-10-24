import { useState } from 'react';
import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { EvidenceRow, TimelineEntry } from '../features/operations/fixtures-cases.js';
import { DISPUTE_CASE } from '../features/operations/fixtures-cases.js';
import type { Column } from '../features/operations/ui.js';
import { Amount, DataTable, Intro, Reference, StatusTag, TwoColumn } from '../features/operations/ui.js';
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
  TextArea,
} from '../shell/ui.js';

const EVIDENCE_COLUMNS: readonly Column<EvidenceRow>[] = [
  { key: 'source', header: 'Source', render: (row) => row.source },
  { key: 'detail', header: 'Evidence', render: (row) => row.detail },
  { key: 'received', header: 'Received (UTC)', render: (row) => formatInstant(row.receivedAt) },
];

const DECISION_OPTIONS = [
  { value: '', label: 'Select a decision' },
  { value: 'refund', label: 'Refund the buyer in full' },
  { value: 'partial', label: 'Refund part of the order' },
  { value: 'release', label: 'Release the held amount to the seller' },
  { value: 'evidence', label: 'Request more evidence' },
] as const;

/** Route '/disputes/:id', class 'app'. A single dispute case file and its decision. */
export default function DisputeCase({ route }: { route: RouteDef }) {
  const dispute = DISPUTE_CASE;
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const reasonReady = reason.trim().length >= 12;
  const canRecord = decision !== '' && reasonReady && reviewed;

  return (
    <>
      <PageHeader
        title={route.label}
        kicker={`Case ${dispute.id}`}
        actions={<StatusTag tone="caution">Awaiting seller</StatusTag>}
      />
      <Intro>
        Both sides have uploaded evidence and the order amount is held. A resolver reads the file, names the decision
        and records why. The buyer and seller are told the outcome; the internal note stays in the audit trail.
      </Intro>

      <TwoColumn>
        <Panel title="Order">
          <KeyValue
            items={[
              { term: 'Case', detail: <Reference>{dispute.id}</Reference> },
              { term: 'Order', detail: <Reference>{dispute.orderId}</Reference> },
              { term: 'Item', detail: dispute.item },
              { term: 'Buyer', detail: `${dispute.buyerHandle} — ${dispute.buyerName}` },
              { term: 'Seller', detail: `${dispute.sellerHandle} — ${dispute.sellerName}` },
              { term: 'Amount held', detail: <Amount cents={dispute.amountCents} /> },
              { term: 'Opened', detail: formatInstant(dispute.openedAt) },
              { term: 'Seller response due', detail: formatInstant(dispute.respondBy) },
              { term: 'Delivery', detail: dispute.delivery },
            ]}
          />
        </Panel>
        <Panel title="The claim" tone="caution">
          <p style={{ margin: 0, lineHeight: 1.55 }}>{dispute.claim}</p>
          <p style={{ margin: 0, color: tokens.text.secondary }}>
            Held funds: <Amount cents={dispute.amountCents} />. A refund cannot exceed this amount; the platform fee is
            returned with a full refund and retained on a partial refund.
          </p>
        </Panel>
      </TwoColumn>

      <Section title="Evidence on file">
        <DataTable
          caption="Evidence uploaded to this dispute"
          columns={EVIDENCE_COLUMNS}
          rows={dispute.evidence}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title="Timeline">
        <ol style={{ margin: 0, paddingLeft: tokens.layout.stack, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {dispute.timeline.map((entry: TimelineEntry) => (
            <li key={`${entry.at}-${entry.actor}`} style={{ fontSize: '0.875rem' }}>
              <span style={{ color: tokens.text.secondary }}>{formatInstant(entry.at)}</span> —{' '}
              <strong>{entry.actor}</strong>: {entry.event}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Decision">
        <Panel tone="negative">
          <SelectField
            id="dispute-decision"
            label="Outcome"
            value={decision}
            options={DECISION_OPTIONS}
            onChange={setDecision}
            hint="The buyer and seller both receive this outcome."
          />
          <TextArea
            id="dispute-reason"
            label="Reason for the decision"
            value={reason}
            onChange={setReason}
            rows={4}
            hint="At least 12 characters. Name the evidence that decided it."
          />
          <CheckRow
            id="dispute-reviewed"
            label="I have read both sides of the file and every piece of evidence."
            checked={reviewed}
            onChange={setReviewed}
          />
          <ActionButton
            label="Record decision"
            tone="danger"
            onClick={() => undefined}
            disabled={!canRecord}
            disabledReason={
              decision === ''
                ? 'Choose an outcome first.'
                : !reasonReady
                  ? 'Give a reason of at least 12 characters.'
                  : !reviewed
                    ? 'Confirm that you reviewed both sides of the file.'
                    : undefined
            }
          />
        </Panel>
        <Notice tone="info" title="Money moves once">
          Recording a refund or release writes an audit stamp with your account, role, the case id, the reason and the
          UTC time. Retrying the same decision is refused by the ledger rather than paying twice.
        </Notice>
      </Section>
    </>
  );
}
