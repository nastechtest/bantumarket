import { useState } from 'react';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDate, sastDateTime } from '../../lib/dates.js';
import { sellerFeePercentLabel } from '../../lib/pricing.js';
import { Chip, EmptyNote, KeyValue, Note, Panel } from '../../ui/primitives.js';
import { SALE_STATUS_LABELS, saleById, saleStatusTone, sellerPayoutFor } from './api/sale-fixtures.js';

const PLACES = [
  'V&A Waterfront, information desk',
  'Canal Walk, food court entrance',
  'Truth Coffee, Buitenkant Street',
  'Cape Town station, main concourse',
] as const;

const EVENT_MARKER: Readonly<Record<'done' | 'current' | 'upcoming', string>> = {
  done: '✓',
  current: '●',
  upcoming: '○',
};

export function SaleDetailPage({ saleId }: { readonly saleId: string | null }) {
  const sale = saleById(saleId);
  const [handoverDate, setHandoverDate] = useState('');
  const [place, setPlace] = useState('');
  const [scheduled, setScheduled] = useState(false);

  if (sale === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <PageHeader title="Sale not found" eyebrow="Orders" description="That order id is not in your sales." />
        <EmptyNote
          title="This sale may belong to another seller"
          body="Open your sales list to see every paid order and its current state."
          action={<a className="button" href="/orders">Back to sales</a>}
        />
      </div>
    );
  }

  const payout = sellerPayoutFor(sale);
  const canSchedule = sale.status === 'PAID';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title={sale.listingTitle}
        eyebrow={`${sale.reference} · ${sale.id}`}
        description={`Paid by ${sale.buyerHandle} on ${sale.paidAt === null ? 'an unrecorded date' : sastDate(sale.paidAt)}. The money is held until the handover is confirmed by both sides.`}
      >
        <Chip tone={saleStatusTone(sale.status)}>{SALE_STATUS_LABELS[sale.status]}</Chip>
        <a className="button secondary" href={`/messages/thr_2001?about=${sale.id}`}>
          Message buyer
        </a>
      </PageHeader>

      {sale.disputeNote !== null ? (
        <Note tone="problem" title="This order is in dispute">
          {sale.disputeNote}
        </Note>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Panel title="Where the order is" description="The ledger records each step; this is the same order of events the buyer sees." id="sale-timeline">
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sale.events.map((event) => (
              <li
                key={event.id}
                data-state={event.state}
                {...(event.state === 'current' ? { 'aria-current': 'step' as const } : {})}
                style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8, alignItems: 'start' }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    color:
                      event.state === 'done'
                        ? raw.color.signalPositive
                        : event.state === 'current'
                          ? raw.color.accent600
                          : raw.color.ink300,
                    textAlign: 'center',
                  }}
                >
                  {EVENT_MARKER[event.state]}
                </span>
                <div>
                  <strong style={{ fontSize: '0.92rem' }}>{event.label}</strong>
                  <p style={{ margin: '2px 0 0', color: tokens.text.secondary, fontSize: '0.84rem', lineHeight: 1.5 }}>{event.detail}</p>
                  {event.at === '' ? null : (
                    <time dateTime={event.at} style={{ display: 'block', marginTop: 3, color: tokens.text.secondary, fontSize: '0.8rem' }}>
                      {sastDateTime(event.at)}
                    </time>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {scheduled ? (
            <Note tone="success" title="Handover requested">
              {sastDate(`${handoverDate}T12:00:00+02:00`)} at {place}. The buyer still needs to accept; the money stays held until
              you both confirm with the handover PIN.
            </Note>
          ) : null}
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Panel title="Your money" id="sale-money">
            <div style={{ display: 'grid', gap: '6px', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>Buyer paid</span>
                <MoneyText value={sale.itemPrice} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>Seller success fee</span>
                <span>{sellerFeePercentLabel()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${raw.color.ink100}`, paddingTop: 8, fontWeight: 600 }}>
                <span>You receive on completion</span>
                <MoneyText value={payout} />
              </div>
            </div>
            <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
              {sale.status === 'COMPLETED'
                ? 'This amount became payable on the next payout run after the handover.'
                : 'Held, not yet payable. A refund or dispute can change this amount before completion.'}
            </p>
          </Panel>

          <Panel title="Buyer" id="sale-buyer">
            <KeyValue label="Handle">{sale.buyerHandle}</KeyValue>
            <KeyValue label="Collection area">{sale.buyerArea}</KeyValue>
            <KeyValue label="Contact">Through NasTech messages only</KeyValue>
            <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
              Phone numbers are not shown on either side. Keep arrangements in the conversation so support can read them if
              something goes wrong.
            </p>
            <a href={`/messages/thr_2001?about=${sale.id}`}>Open conversation</a>
          </Panel>

          {canSchedule ? (
            <Panel title="Schedule the handover" description="Choose a public place. Do not share your home address." id="sale-schedule">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
                Date
                <input
                  type="date"
                  value={handoverDate}
                  min="2026-10-16"
                  onChange={(event) => setHandoverDate(event.target.value)}
                  style={{ minHeight: '44px', padding: '8px 10px', border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, font: 'inherit' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
                Public meeting place
                <select
                  value={place}
                  onChange={(event) => setPlace(event.target.value)}
                  style={{ minHeight: '44px', padding: '8px 10px', border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, font: 'inherit' }}
                >
                  <option value="">Choose a place</option>
                  {PLACES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={handoverDate === '' || place === '' || scheduled}
                onClick={() => setScheduled(true)}
              >
                {scheduled ? 'Handover requested' : 'Request this handover'}
              </button>
              {handoverDate === '' || place === '' ? (
                <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
                  Both a date and a public place are needed before the buyer can accept.
                </p>
              ) : null}
            </Panel>
          ) : (
            <Panel title="Handover" id="sale-handover">
              {sale.handoverAt === null ? (
                <p style={{ margin: 0, color: tokens.text.secondary }}>No handover has been scheduled for this order.</p>
              ) : (
                <>
                  <KeyValue label="When">{sastDateTime(sale.handoverAt)}</KeyValue>
                  <KeyValue label="Where">{sale.handoverPlace ?? 'Not recorded'}</KeyValue>
                  {sale.completedAt === null ? null : <KeyValue label="Completed">{sastDateTime(sale.completedAt)}</KeyValue>}
                </>
              )}
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Order facts" description="What the ledger holds for this sale." id="sale-facts">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <KeyValue label="Order">{sale.reference}</KeyValue>
          <KeyValue label="Order id">{sale.id}</KeyValue>
          <KeyValue label="Listing">{sale.listingId}</KeyValue>
          <KeyValue label="Created">{sastDate(sale.createdAt)}</KeyValue>
          <KeyValue label="Paid">{sale.paidAt === null ? 'Not paid' : sastDate(sale.paidAt)}</KeyValue>
          <KeyValue label="State">{SALE_STATUS_LABELS[sale.status]}</KeyValue>
        </div>
      </Panel>
    </div>
  );
}
