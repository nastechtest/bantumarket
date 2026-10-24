import { useMemo, useState } from 'react';
import { MoneyText, formatCents } from '@nastech/design-system';
import { tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDate } from '../../lib/dates.js';
import { countOf } from '../../lib/format.js';
import { Chip, DataTable, EmptyNote, Note, Panel, Stat, type Column } from '../../ui/primitives.js';
import {
  SALE_STATUS_LABELS,
  SALES,
  needsSellerAction,
  saleStatusTone,
  type Sale,
} from './api/sale-fixtures.js';

type Filter = 'all' | 'needs-you' | 'handover' | 'completed' | 'disputed';

const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
  { id: 'all', label: 'All sales' },
  { id: 'needs-you', label: 'Needs you' },
  { id: 'handover', label: 'In handover' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed', label: 'Disputed' },
];

function matches(sale: Sale, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'needs-you':
      return needsSellerAction(sale);
    case 'handover':
      return sale.status === 'HANDOVER_SCHEDULED' || sale.status === 'HANDOVER_CONFIRMED';
    case 'completed':
      return sale.status === 'COMPLETED';
    case 'disputed':
      return sale.status === 'IN_DISPUTE';
  }
}

export function SalesPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => SALES.filter((sale) => matches(sale, filter)), [filter]);

  const held = SALES.filter((sale) => sale.status !== 'COMPLETED' && sale.status !== 'CANCELLED' && sale.status !== 'REFUNDED');
  const heldTotal = held.reduce((sum, sale) => sum + sale.itemPrice.cents, 0);
  const completed = SALES.filter((sale) => sale.status === 'COMPLETED');
  const needsYou = SALES.filter(needsSellerAction).length;

  const columns: readonly Column<Sale>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (sale) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <a href={`/orders/${sale.id}`} style={{ color: tokens.text.primary, fontWeight: 600 }}>
            {sale.reference}
          </a>
          <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>{sale.id}</span>
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Watch',
      render: (sale) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{sale.listingTitle}</span>
          <a href={`/listings/${sale.listingId}`} style={{ fontSize: '0.8125rem' }}>
            View listing
          </a>
        </div>
      ),
    },
    {
      key: 'buyer',
      header: 'Buyer',
      render: (sale) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>{sale.buyerHandle}</span>
          <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>{sale.buyerArea}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (sale) => <Chip tone={saleStatusTone(sale.status)}>{SALE_STATUS_LABELS[sale.status]}</Chip>,
    },
    {
      key: 'amount',
      header: 'Held / paid',
      align: 'end',
      render: (sale) => <MoneyText value={sale.itemPrice} />,
    },
    {
      key: 'date',
      header: 'Paid',
      render: (sale) => <span style={{ whiteSpace: 'nowrap' }}>{sale.paidAt === null ? 'Not yet' : sastDate(sale.paidAt)}</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'end',
      render: (sale) => (
        <a href={`/orders/${sale.id}`}>{sale.status === 'PAID' ? 'Schedule handover' : 'Open sale'}</a>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Sales"
        eyebrow="Orders"
        description="Paid orders, handovers and disputes. The money a buyer has paid stays held until you both confirm the exchange."
      />

      <Panel title="Money in your sales" description="Held money is real money, but it is not payable until the handover is confirmed." id="sales-summary">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
          <Stat label="Held for buyers" value={formatCents(heldTotal)} detail={`${countOf(held.length, 'open order')} not yet released.`} />
          <Stat label="Completed this month" value={formatCents(completed.reduce((sum, sale) => sum + sale.itemPrice.cents, 0))} detail={`${countOf(completed.length, 'completed sale')}.`} />
          <Stat label="Waiting on you" value={needsYou} detail="A handover to schedule or a dispute to answer." />
        </div>
      </Panel>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={filter === option.id ? '' : 'secondary'}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <DataTable
        caption={`${countOf(rows.length, 'sale')} shown`}
        columns={columns}
        rows={rows}
        rowKey={(sale) => sale.id}
        empty={
          <EmptyNote
            title="No sales in this view"
            body="When a buyer pays, the order appears here with its held amount and the next step."
            action={
              <button type="button" className="secondary" onClick={() => setFilter('all')}>
                Show all sales
              </button>
            }
          />
        }
      />

      {needsYou > 0 ? (
        <Note tone="caution" title="A paid order is waiting on you">
          Schedule the handover from the order. Until both sides confirm, the buyer’s money stays held and no payout is scheduled.
        </Note>
      ) : null}
    </div>
  );
}
