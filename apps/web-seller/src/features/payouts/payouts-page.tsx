import { useState } from 'react';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDate, sastDateTime } from '../../lib/dates.js';
import { CAPTURE_BREAK_EVEN, CAPTURE_PRICE, sellerFeePercentLabel } from '../../lib/pricing.js';
import { Chip, DataTable, KeyValue, Note, Panel, Stat, type Column } from '../../ui/primitives.js';
import {
  CAPTURE_CHARGES,
  DISPUTED,
  HELD_FOR_BUYERS,
  NEXT_RUN_DATE,
  PAYABLE_NOW,
  PAYOUT_ACCOUNT,
  PAYOUT_RUNS,
  type PayoutRun,
} from './api/payout-fixtures.js';

const STATE_LABEL: Readonly<Record<PayoutRun['state'], string>> = {
  paid: 'Paid',
  returned: 'Returned by bank',
  scheduled: 'Scheduled',
};

const STATE_TONE: Readonly<Record<PayoutRun['state'], 'success' | 'problem' | 'progress'>> = {
  paid: 'success',
  returned: 'problem',
  scheduled: 'progress',
};

export function PayoutsPage() {
  const [editing, setEditing] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const columns: readonly Column<PayoutRun>[] = [
    {
      key: 'date',
      header: 'Run date',
      render: (run) => <span style={{ whiteSpace: 'nowrap' }}>{sastDate(`${run.runDate}T08:00:00+02:00`)}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (run) => <MoneyText value={run.amount} />,
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (run) => <span>{run.destination}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (run) => <Chip tone={STATE_TONE[run.state]}>{STATE_LABEL[run.state]}</Chip>,
    },
    {
      key: 'note',
      header: 'Note',
      render: (run) => <span style={{ fontSize: '0.84rem', color: tokens.text.secondary }}>{run.note ?? '—'}</span>,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Payouts"
        eyebrow="Money"
        description="What is payable, what is still held for buyers, and where the money is sent. A payout is only scheduled after an order completes."
      />

      <Note tone="problem" title="Your last payout was returned by the bank">
        The R3,890 run on 12 October came back because the account on file was closed. The money is still yours and is included in
        the next run once the details below are updated.
      </Note>

      <Panel title="Balance" description="Two numbers, never one balance. Held money is released only after a completed handover." id="payout-balance">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
          <Stat label="Payable now" value={<MoneyText value={PAYABLE_NOW} />} detail={`Next run: ${sastDate(`${NEXT_RUN_DATE}T08:00:00+02:00`)}.`} />
          <Stat label="Held for buyers" value={<MoneyText value={HELD_FOR_BUYERS} />} detail="Released when the buyer confirms handover." />
          <Stat label="In dispute" value={<MoneyText value={DISPUTED} />} detail="Does not move until support decides." />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Panel
          title="Where the money goes"
          description="Only the last four digits are stored for display. The full number is held by the payment provider."
          actions={
            <button type="button" className="secondary" onClick={() => setEditing((current) => !current)}>
              {editing ? 'Cancel change' : 'Update bank details'}
            </button>
          }
          id="payout-account"
        >
          <KeyValue label="Destination">{PAYOUT_ACCOUNT.destination}</KeyValue>
          <KeyValue label="Account type">{PAYOUT_ACCOUNT.accountType}</KeyValue>
          <KeyValue label="Account holder">{PAYOUT_ACCOUNT.holder}</KeyValue>
          <KeyValue label="Masked account">{PAYOUT_ACCOUNT.maskedNumber}</KeyValue>
          <KeyValue label="Confirmed">{sastDateTime(PAYOUT_ACCOUNT.confirmedAt)}</KeyValue>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: `1px solid ${raw.color.ink100}`, paddingTop: raw.space.s3 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
                New account number
                <input
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(event) => {
                    setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 11));
                    setSubmitted(false);
                  }}
                  placeholder="Enter the full account number"
                  style={{ minHeight: '44px', padding: '8px 10px', border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, font: 'inherit' }}
                />
              </label>
              <button
                type="button"
                disabled={accountNumber.length < 6}
                onClick={() => setSubmitted(true)}
              >
                Save account details
              </button>
              {submitted ? (
                <Note tone="success" title="Details received">
                  We will confirm the change by email before the next payout run. The displayed destination stays masked.
                </Note>
              ) : (
                <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
                  Enter at least six digits. We never show the full number again after it is saved.
                </p>
              )}
            </div>
          ) : null}
        </Panel>

        <Panel title="Capture charges" description="A capture is optional and charged once, after the studio run." id="payout-capture">
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55 }}>
            <MoneyText value={CAPTURE_PRICE} /> per capture, {sellerFeePercentLabel()} seller fee, break-even{' '}
            <MoneyText value={CAPTURE_BREAK_EVEN} />.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ color: tokens.text.secondary }}>Per capture</span>
            <strong style={{ fontSize: '1.5rem' }}><MoneyText value={CAPTURE_PRICE} /></strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: tokens.text.secondary }}>Seller fee</span>
            <strong>{sellerFeePercentLabel()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: tokens.text.secondary }}>Break-even</span>
            <strong><MoneyText value={CAPTURE_BREAK_EVEN} /></strong>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {CAPTURE_CHARGES.map((charge) => (
              <li key={charge.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${raw.color.ink100}`, paddingTop: 6 }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>{charge.listingTitle}</span>
                  <span style={{ color: tokens.text.secondary, fontSize: '0.8rem' }}>{sastDate(charge.chargedAt)} · {charge.listingId}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <MoneyText value={charge.amount} />
                  <span style={{ display: 'block', color: tokens.text.secondary, fontSize: '0.8rem' }}>{charge.state === 'charged' ? 'Charged' : 'Not charged'}</span>
                </span>
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            The capture fee is separate from a sale. At a {sellerFeePercentLabel()} seller fee, a capture pays for itself on an
            item priced above <MoneyText value={CAPTURE_BREAK_EVEN} />.
          </p>
        </Panel>
      </div>

      <Panel title="Payout history" description="Every run, including one the bank returned." id="payout-history">
        <DataTable caption="Payout runs" columns={columns} rows={PAYOUT_RUNS} rowKey={(run) => run.id} />
      </Panel>

      <Note title="Why an amount can be held">
        A paid order holds the buyer’s money until the handover is confirmed. A dispute keeps it held while support reads both
        records. Held money is not a payout that is late; it is money that has not been released yet.
      </Note>
    </div>
  );
}
