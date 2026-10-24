import { useState } from 'react';
import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { PopiaRow, RetentionRow } from '../features/operations/fixtures-money.js';
import { POPIA_CASE, POPIA_ROWS } from '../features/operations/fixtures-money.js';
import type { Column } from '../features/operations/ui.js';
import { DataTable, Intro, Reference, StatStrip, StatusTag, TwoColumn } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import {
  ActionButton,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  Section,
  SelectField,
  TextArea,
} from '../shell/ui.js';

const REQUEST_COLUMNS: readonly Column<PopiaRow>[] = [
  { key: 'request', header: 'Request', render: (row) => <Reference>{row.id}</Reference> },
  { key: 'requester', header: 'Requester', render: (row) => row.requester },
  { key: 'type', header: 'Type', render: (row) => <StatusTag tone="info">{row.type}</StatusTag> },
  { key: 'received', header: 'Received (UTC)', render: (row) => formatInstant(row.receivedAt) },
  { key: 'due', header: 'Decision due (UTC)', render: (row) => formatInstant(row.dueAt) },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={row.status === 'Partially refused' ? 'caution' : 'neutral'}>{row.status}</StatusTag> },
];

const RETENTION_COLUMNS: readonly Column<RetentionRow>[] = [
  { key: 'data', header: 'Data class', render: (row) => row.dataClass },
  {
    key: 'decision',
    header: 'Decision',
    render: (row) => (
      <StatusTag tone={row.decision === 'Erase' ? 'positive' : 'caution'}>{row.decision}</StatusTag>
    ),
  },
  { key: 'basis', header: 'Basis', render: (row) => row.basis },
  { key: 'until', header: 'Kept until', render: (row) => row.until },
];

const DECISION_OPTIONS = [
  { value: '', label: 'Select a decision' },
  { value: 'grant', label: 'Grant erasure in full' },
  { value: 'partial', label: 'Partially refuse: erase what may be erased, retain the rest' },
  { value: 'refuse', label: 'Refuse: request is manifestly unfounded' },
] as const;

/** Route '/requests', class 'app'. POPIA data-subject requests and their decisions. */
export default function PopiaRequests({ route }: { route: RouteDef }) {
  const request = POPIA_CASE;
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const reasonReady = reason.trim().length >= 12;
  const canRecord = decision !== '' && reasonReady;
  const retainedClasses = request.retention.filter((row) => row.decision === 'Retain').length;

  return (
    <>
      <PageHeader title={route.label} kicker="Privacy office" />
      <Intro>
        A data-subject request has a 30-day clock. Read the scope, decide what may be erased and what must be kept, and
        record the decision with the legal basis. An erasure request is never a blanket delete: financial and dispute
        records stay for their statutory period.
      </Intro>
      <StatStrip
        items={[
          { label: 'Open requests', value: '5' },
          { label: 'Due this week', value: '2', tone: 'caution' },
          { label: 'Erasure requests', value: '2' },
          { label: 'Partially refused', value: '1', tone: 'caution' },
        ]}
      />

      <Section title="Requests">
        <DataTable
          caption="POPIA requests in the current queue"
          columns={REQUEST_COLUMNS}
          rows={POPIA_ROWS}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title={`Request ${request.id}`}>
        <TwoColumn>
          <Panel title="Request">
            <KeyValue
              items={[
                { term: 'Reference', detail: <Reference>{request.id}</Reference> },
                { term: 'Requester', detail: `${request.requester} — ${request.requesterName}` },
                { term: 'Type', detail: request.type },
                { term: 'Received', detail: formatInstant(request.receivedAt) },
                { term: 'Decision due', detail: formatInstant(request.dueAt) },
                { term: 'Scope', detail: request.scope.join(', ') },
              ]}
            />
            <p style={{ margin: 0, color: tokens.text.secondary }}>{request.note}</p>
          </Panel>
          <Panel title="Erasure versus retention" tone="caution">
            <p style={{ margin: 0, lineHeight: 1.55 }}>
              <strong>Erase</strong> removes the record from the live system and from backups on the next cycle.{' '}
              <strong>Retain</strong> keeps a record because a law requires it; access is limited to finance, tax or
              dispute work.
            </p>
            <p style={{ margin: 0, lineHeight: 1.55 }}>
              This request touches {request.retention.length} data classes; {retainedClasses} are under a retention
              duty. A full grant is therefore refused, and the requester is told which records remain and why.
            </p>
          </Panel>
        </TwoColumn>
      </Section>

      <Section title="Retention schedule">
        <DataTable
          caption="What may be erased and what must be retained for this request"
          columns={RETENTION_COLUMNS}
          rows={request.retention}
          rowKey={(row) => row.dataClass}
        />
      </Section>

      <Section title="Decision">
        <Panel>
          <SelectField
            id="popia-decision"
            label="Outcome"
            value={decision}
            options={DECISION_OPTIONS}
            onChange={setDecision}
            hint="The decision and its basis are sent to the requester."
          />
          <TextArea
            id="popia-reason"
            label="Reason and legal basis"
            value={reason}
            onChange={setReason}
            rows={3}
            hint="At least 12 characters. Name the retention duty where records are kept."
          />
          {decision === 'grant' ? (
            <Notice tone="negative" title="A full grant is not available">
              Three data classes are under a statutory retention duty. Choose the partial decision so the erasure and
              the retention are recorded together.
            </Notice>
          ) : null}
          {decision === 'partial' ? (
            <Notice tone="positive" title="Partial refusal is a decision, not a delay">
              The requester is told what was erased, what was kept, the legal basis and how to complain to the
              Information Regulator.
            </Notice>
          ) : null}
          <ActionButton
            label="Record POPIA decision"
            onClick={() => undefined}
            disabled={!canRecord}
            disabledReason={
              decision === ''
                ? 'Choose a decision first.'
                : !reasonReady
                  ? 'Give a reason and legal basis of at least 12 characters.'
                  : undefined
            }
          />
        </Panel>
      </Section>
    </>
  );
}
