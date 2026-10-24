import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';
import type { OrderStatus } from '@nastech/api-client';

/** Seller-side sale records. The order state vocabulary is the ledger's, not a paraphrase. */

export interface SaleEvent {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly at: string;
  readonly state: 'done' | 'current' | 'upcoming';
}

export interface Sale {
  readonly id: string;
  readonly reference: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly buyerHandle: string;
  readonly buyerArea: string;
  readonly status: OrderStatus;
  readonly itemPrice: Money;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly handoverAt: string | null;
  readonly handoverPlace: string | null;
  readonly completedAt: string | null;
  readonly disputeNote: string | null;
  readonly events: readonly SaleEvent[];
}

const SELLER_FEE = money(0);

export function sellerPayoutFor(sale: Sale): Money {
  return money(sale.itemPrice.cents - SELLER_FEE.cents);
}

export const SALES: readonly Sale[] = [
  {
    id: 'ord_1042',
    reference: 'NTM-1042',
    listingId: 'lst_0981',
    listingTitle: 'Tissot PRX Powermatic 80',
    buyerHandle: '@nomsa.m',
    buyerArea: 'Observatory, Cape Town',
    status: 'PAID',
    itemPrice: money(420_000),
    createdAt: '2026-10-15T09:12:00+02:00',
    paidAt: '2026-10-15T09:14:00+02:00',
    handoverAt: null,
    handoverPlace: null,
    completedAt: null,
    disputeNote: null,
    events: [
      { id: 'ev_paid', label: 'Payment received', detail: 'R4,200 is held by NasTech until you both confirm the handover.', at: '2026-10-15T09:14:00+02:00', state: 'done' },
      { id: 'ev_schedule', label: 'Schedule the handover', detail: 'Choose a public place and a time that suits you both.', at: '2026-10-15T09:14:00+02:00', state: 'current' },
      { id: 'ev_handover', label: 'Meet and confirm', detail: 'The buyer checks the watch; you both confirm with the handover PIN.', at: '', state: 'upcoming' },
      { id: 'ev_complete', label: 'Money released', detail: 'The held amount becomes payable on the next payout run.', at: '', state: 'upcoming' },
    ],
  },
  {
    id: 'ord_1035',
    reference: 'NTM-1035',
    listingId: 'lst_1002',
    listingTitle: 'Tudor Black Bay 58, navy bezel',
    buyerHandle: '@lerato.j',
    buyerArea: 'Sea Point, Cape Town',
    status: 'HANDOVER_SCHEDULED',
    itemPrice: money(4_250_000),
    createdAt: '2026-10-13T17:40:00+02:00',
    paidAt: '2026-10-13T17:42:00+02:00',
    handoverAt: '2026-10-17T11:00:00+02:00',
    handoverPlace: 'V&A Waterfront, information desk',
    completedAt: null,
    disputeNote: null,
    events: [
      { id: 'ev_paid', label: 'Payment received', detail: 'R42,500 is held by NasTech until you both confirm the handover.', at: '2026-10-13T17:42:00+02:00', state: 'done' },
      { id: 'ev_schedule', label: 'Handover scheduled', detail: 'V&A Waterfront, information desk, 17 Oct at 11:00.', at: '2026-10-14T08:05:00+02:00', state: 'done' },
      { id: 'ev_handover', label: 'Meet and confirm', detail: 'Bring the box, papers and the spare links.', at: '2026-10-17T11:00:00+02:00', state: 'current' },
      { id: 'ev_complete', label: 'Money released', detail: 'The held amount becomes payable on the next payout run.', at: '', state: 'upcoming' },
    ],
  },
  {
    id: 'ord_1010',
    reference: 'NTM-1010',
    listingId: 'lst_0971',
    listingTitle: 'Hamilton Khaki Field Mechanical',
    buyerHandle: '@thabo.k',
    buyerArea: 'Woodstock, Cape Town',
    status: 'COMPLETED',
    itemPrice: money(389_000),
    createdAt: '2026-10-06T12:20:00+02:00',
    paidAt: '2026-10-06T12:22:00+02:00',
    handoverAt: '2026-10-08T14:30:00+02:00',
    handoverPlace: 'Truth Coffee, Buitenkant Street',
    completedAt: '2026-10-08T14:36:00+02:00',
    disputeNote: null,
    events: [
      { id: 'ev_paid', label: 'Payment received', detail: 'R3,890 was held by NasTech.', at: '2026-10-06T12:22:00+02:00', state: 'done' },
      { id: 'ev_schedule', label: 'Handover scheduled', detail: 'Truth Coffee, 8 Oct at 14:30.', at: '2026-10-07T09:10:00+02:00', state: 'done' },
      { id: 'ev_handover', label: 'Handover confirmed', detail: 'Both sides confirmed the exchange with the PIN.', at: '2026-10-08T14:34:00+02:00', state: 'done' },
      { id: 'ev_complete', label: 'Money released', detail: 'R3,890 became payable on the 12 Oct payout run.', at: '2026-10-08T14:36:00+02:00', state: 'current' },
    ],
  },
  {
    id: 'ord_0995',
    reference: 'NTM-0995',
    listingId: 'lst_0990',
    listingTitle: 'Omega Seamaster 300M, 2019',
    buyerHandle: '@sipho.d',
    buyerArea: 'Century City, Cape Town',
    status: 'IN_DISPUTE',
    itemPrice: money(6_450_000),
    createdAt: '2026-09-30T10:00:00+02:00',
    paidAt: '2026-09-30T10:04:00+02:00',
    handoverAt: '2026-10-03T16:00:00+02:00',
    handoverPlace: 'Canal Walk, food court entrance',
    completedAt: null,
    disputeNote:
      'The buyer says the bezel has a mark that was not in the photographs. The R64,500 stays held; a support agent is reading both condition records.',
    events: [
      { id: 'ev_paid', label: 'Payment received', detail: 'R64,500 is held by NasTech.', at: '2026-09-30T10:04:00+02:00', state: 'done' },
      { id: 'ev_schedule', label: 'Handover scheduled', detail: 'Canal Walk, 3 Oct at 16:00.', at: '2026-10-01T11:20:00+02:00', state: 'done' },
      { id: 'ev_dispute', label: 'Dispute opened', detail: 'The money does not move while support reviews the evidence.', at: '2026-10-03T18:12:00+02:00', state: 'current' },
      { id: 'ev_resolve', label: 'Support decision', detail: 'Both sides will see the same decision and its reason.', at: '', state: 'upcoming' },
    ],
  },
];

export function saleById(id: string | null): Sale | null {
  if (id === null) return null;
  return SALES.find((sale) => sale.id === id) ?? null;
}

export const SALE_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid — schedule handover',
  HANDOVER_SCHEDULED: 'Handover scheduled',
  HANDOVER_CONFIRMED: 'Handover confirmed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUND_PENDING: 'Refund pending',
  REFUNDED: 'Refunded',
  IN_DISPUTE: 'In dispute',
};

export function saleStatusTone(status: OrderStatus): 'neutral' | 'progress' | 'success' | 'caution' | 'problem' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'PAID':
    case 'HANDOVER_CONFIRMED':
      return 'caution';
    case 'HANDOVER_SCHEDULED':
      return 'progress';
    case 'IN_DISPUTE':
      return 'problem';
    default:
      return 'neutral';
  }
}

export function needsSellerAction(sale: Sale): boolean {
  return sale.status === 'PAID' || sale.status === 'IN_DISPUTE';
}
