import { useState } from 'react';
import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { UserRow } from '../features/operations/fixtures-money.js';
import { USER_DETAIL, USER_ROWS } from '../features/operations/fixtures-money.js';
import type { Column, Tone } from '../features/operations/ui.js';
import {
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
  TextArea,
} from '../shell/ui.js';

function statusTone(status: string): Tone {
  if (status === 'Active') return 'positive';
  if (status === 'Selling limited') return 'caution';
  return 'negative';
}

const COLUMNS: readonly Column<UserRow>[] = [
  {
    key: 'account',
    header: 'Account',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span>{row.name}</span>
        <Reference>{row.handle}</Reference>
      </div>
    ),
  },
  { key: 'kind', header: 'Kind', render: (row) => row.kind },
  { key: 'joined', header: 'Joined', render: (row) => row.joined },
  { key: 'tier', header: 'Verification', render: (row) => <StatusTag tone="info">{row.tier}</StatusTag> },
  { key: 'activity', header: 'Activity', render: (row) => row.activity },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
];

const ACTION_OPTIONS = [
  { value: '', label: 'Select an account action' },
  { value: 'hold', label: 'Place a 7-day selling hold' },
  { value: 'limit', label: 'Limit selling to 5 listings per month' },
  { value: 'suspend', label: 'Suspend the account' },
] as const;

/** Route '/users', class 'app'. Account lookup and account-level actions. */
export default function Users({ route }: { route: RouteDef }) {
  const account = USER_DETAIL;
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reasonReady = reason.trim().length >= 12;
  const canAct = action !== '' && reasonReady && confirmed;

  return (
    <>
      <PageHeader title={route.label} kicker="Account operations" />
      <Intro>
        Accounts shows buyers and sellers, their verification tier and their activity. Account actions are for safety
        work: a hold, a selling limit or a suspension. They are recorded against your account and are appealable.
      </Intro>
      <StatStrip
        items={[
          { label: 'Active accounts', value: '18,402' },
          { label: 'Selling limited', value: '12', tone: 'caution' },
          { label: 'Under review', value: '4', tone: 'negative' },
          { label: 'New this week', value: '96' },
        ]}
      />

      <Section title="Accounts">
        <DataTable
          caption="Accounts in the operations index"
          columns={COLUMNS}
          rows={USER_ROWS}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title={`Account ${account.handle}`}>
        <TwoColumn>
          <Panel title="Profile">
            <KeyValue
              items={[
                { term: 'Account', detail: <Reference>{account.id}</Reference> },
                { term: 'Name', detail: account.name },
                { term: 'Kind', detail: account.kind },
                { term: 'Joined', detail: account.joined },
                { term: 'Verification', detail: account.tier },
                { term: 'Sales', detail: String(account.sales) },
                { term: 'Rating', detail: account.rating },
                { term: 'Dispute rate', detail: account.disputeRate },
                { term: 'Last active', detail: formatInstant(account.lastActive) },
              ]}
            />
            <p style={{ margin: 0 }}>
              <a href={`/risk/${account.linkedRiskCase}`} style={{ color: tokens.action.default }}>
                Open linked risk case {account.linkedRiskCase}
              </a>
            </p>
          </Panel>
          <Panel title="Payout destination" tone="caution">
            <p style={{ margin: 0 }}>
              <MaskedAccount bank={account.payoutBank} last4={account.payoutLast4} />
            </p>
            <p style={{ margin: 0, color: tokens.text.secondary }}>
              Only the institution and last four digits are shown. Finance verifies the account holder before a payout
              batch is prepared; this screen cannot change a destination.
            </p>
          </Panel>
        </TwoColumn>
      </Section>

      <Section title="Account action">
        <Panel tone="negative">
          <SelectField
            id="account-action"
            label="Action"
            value={action}
            options={ACTION_OPTIONS}
            onChange={setAction}
            hint="A hold expires automatically. A suspension stays until a risk analyst reviews it."
          />
          <TextArea
            id="account-reason"
            label="Reason"
            value={reason}
            onChange={setReason}
            rows={3}
            hint="At least 12 characters. This reason is shown to the account holder on appeal."
          />
          <CheckRow
            id="account-confirm"
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
        <Notice tone="info" title="Account actions need account.sanction">
          Reading this screen needs account.view. A hold, limit or suspension also needs account.sanction; the
          transport refuses the action for a session that only has view access.
        </Notice>
      </Section>
    </>
  );
}
