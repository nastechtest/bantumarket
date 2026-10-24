import { useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { LinkedOrder } from '../features/operations/fixtures-cases.js';
import { RISK_CASE } from '../features/operations/fixtures-cases.js';
import type { Column } from '../features/operations/ui.js';
import {
  Amount,
  DataTable,
  Intro,
  MaskedAccount,
  Reference,
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
  TextArea,
} from '../shell/ui.js';

const ORDER_COLUMNS: readonly Column<LinkedOrder>[] = [
  { key: 'order', header: 'Order', render: (row) => <Reference>{row.orderId}</Reference> },
  { key: 'item', header: 'Item', render: (row) => row.item },
  { key: 'amount', header: 'Amount', align: 'end', render: (row) => <Amount cents={row.amountCents} /> },
  { key: 'state', header: 'State', render: (row) => row.state },
];

const ACTION_OPTIONS = [
  { value: '', label: 'Select an account action' },
  { value: 'hold', label: 'Place a 7-day selling hold' },
  { value: 'limit', label: 'Limit selling to 5 listings per month' },
  { value: 'suspend', label: 'Suspend the account' },
] as const;

/** Route '/risk/:caseId', class 'app'. One risk case with its signals and possible actions. */
export default function RiskCase({ route }: { route: RouteDef }) {
  const risk = RISK_CASE;
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reasonReady = reason.trim().length >= 12;
  const canAct = action !== '' && reasonReady && confirmed;

  return (
    <>
      <PageHeader
        title={route.label}
        kicker={`Case ${risk.id}`}
        actions={<StatusTag tone="negative">Hold placed</StatusTag>}
      />
      <Intro>
        Read the signals in time order, then decide whether the account needs a hold, a selling limit or a suspension.
        Every action names the analyst and the reason, and the account holder is told what changed.
      </Intro>

      <TwoColumn>
        <Panel title="Account">
          <KeyValue
            items={[
              { term: 'Handle', detail: risk.handle },
              { term: 'Legal name', detail: risk.legalName },
              { term: 'Member since', detail: risk.joined },
              { term: 'Verification', detail: risk.tier },
              { term: 'Sales', detail: String(risk.sales) },
              { term: 'Dispute rate', detail: risk.disputeRate },
              { term: 'Payout destination', detail: <MaskedAccount bank={risk.payoutBank} last4={risk.payoutLast4} /> },
              { term: 'Destination changed', detail: formatInstant(risk.destinationChanged) },
            ]}
          />
          <p style={{ margin: 0, color: tokens.text.secondary }}>
            The destination is shown as institution and last four digits. The console never renders a full account
            number, even for an analyst who can place a hold.
          </p>
        </Panel>
        <Panel title="Signals" tone="negative">
          <ol style={{ margin: 0, paddingLeft: tokens.layout.stack, display: 'flex', flexDirection: 'column', gap: raw.space.s2 }}>
            {risk.signals.map((signal) => (
              <li key={`${signal.at}-${signal.code}`} style={{ fontSize: '0.875rem' }}>
                <span style={{ color: tokens.text.secondary }}>{formatInstant(signal.at)}</span>
                <br />
                {signal.detail}
              </li>
            ))}
          </ol>
        </Panel>
      </TwoColumn>

      <Section title="Linked orders">
        <DataTable
          caption="Orders linked to this account"
          columns={ORDER_COLUMNS}
          rows={risk.linkedOrders}
          rowKey={(row) => row.orderId}
        />
      </Section>

      <Section title="Account action">
        <Panel tone="negative">
          <SelectField
            id="risk-action"
            label="Action"
            value={action}
            options={ACTION_OPTIONS}
            onChange={setAction}
            hint="A hold expires automatically. A suspension does not; it needs a review date."
          />
          <TextArea
            id="risk-reason"
            label="Reason"
            value={reason}
            onChange={setReason}
            rows={3}
            hint="At least 12 characters. Refer to the signal you relied on."
          />
          <CheckRow
            id="risk-confirmed"
            label="I understand the account holder will be notified and can appeal."
            checked={confirmed}
            onChange={setConfirmed}
          />
          <ActionButton
            label="Record account action"
            tone="danger"
            onClick={() => undefined}
            disabled={!canAct}
            disabledReason={
              action === ''
                ? 'Choose an account action first.'
                : !reasonReady
                  ? 'Give a reason of at least 12 characters.'
                  : !confirmed
                    ? 'Confirm that the account holder will be notified.'
                    : undefined
            }
          />
        </Panel>
        <Notice tone="caution" title="Suspension is reviewed">
          A suspension removes the seller from search and stops new orders. It also needs the account.sanction
          capability; a session with only risk.view can read this case but cannot record that action.
        </Notice>
      </Section>
    </>
  );
}
