/** Dispute and risk fixtures. Handles, not full names, are the identity surface used everywhere. */

export interface DisputeRow {
  readonly id: string;
  readonly orderId: string;
  readonly buyer: string;
  readonly seller: string;
  readonly reason: string;
  readonly amountCents: number;
  readonly openedAt: string;
  readonly sla: string;
  readonly status: string;
}

export const DISPUTE_ROWS: readonly DisputeRow[] = [
  {
    id: 'dsp_2026_3310',
    orderId: 'ord_2026_88421',
    buyer: '@naledi_m',
    seller: '@sandton_time',
    reason: 'Item not as described',
    amountCents: 1_850_000,
    openedAt: '2026-10-20T08:10:00.000Z',
    sla: '22h left',
    status: 'Awaiting seller',
  },
  {
    id: 'dsp_2026_3304',
    orderId: 'ord_2026_88377',
    buyer: '@sipho_d',
    seller: '@capevintage_co',
    reason: 'Item never arrived',
    amountCents: 125_000,
    openedAt: '2026-10-19T14:25:00.000Z',
    sla: '4h overdue',
    status: 'Awaiting courier',
  },
  {
    id: 'dsp_2026_3298',
    orderId: 'ord_2026_88302',
    buyer: '@lerato_m',
    seller: '@pixeljunk_jhb',
    reason: 'Item damaged in transit',
    amountCents: 240_000,
    openedAt: '2026-10-18T09:05:00.000Z',
    sla: 'Met',
    status: 'Refunded',
  },
  {
    id: 'dsp_2026_3291',
    orderId: 'ord_2026_88255',
    buyer: '@riaan_b',
    seller: '@film_supply_ct',
    reason: 'Counterfeit concern',
    amountCents: 310_000,
    openedAt: '2026-10-17T16:40:00.000Z',
    sla: '11h left',
    status: 'Under review',
  },
  {
    id: 'dsp_2026_3286',
    orderId: 'ord_2026_88190',
    buyer: '@fatima_p',
    seller: '@jozi_finds',
    reason: 'Seller cancelled after payment',
    amountCents: 680_000,
    openedAt: '2026-10-16T11:15:00.000Z',
    sla: '2 days left',
    status: 'Refund pending',
  },
  {
    id: 'dsp_2026_3280',
    orderId: 'ord_2026_88144',
    buyer: '@zanele_n',
    seller: '@sneaker_swap_sa',
    reason: 'Size not as listed',
    amountCents: 145_000,
    openedAt: '2026-10-15T07:50:00.000Z',
    sla: 'Met',
    status: 'Closed — returned',
  },
];

export interface EvidenceRow {
  readonly id: string;
  readonly source: string;
  readonly detail: string;
  readonly receivedAt: string;
}

export interface TimelineEntry {
  readonly at: string;
  readonly actor: string;
  readonly event: string;
}

export const DISPUTE_CASE = {
  id: 'dsp_2026_3310',
  orderId: 'ord_2026_88421',
  item: 'Rolex Datejust 1601, 1972',
  buyerHandle: '@naledi_m',
  buyerName: 'Naledi Mahlangu',
  sellerHandle: '@sandton_time',
  sellerName: 'Sandton Timepieces',
  amountCents: 1_850_000,
  openedAt: '2026-10-20T08:10:00.000Z',
  respondBy: '2026-10-23T08:10:00.000Z',
  delivery: 'Courier collected 17 October, delivered 19 October, signed for at reception.',
  claim:
    'Buyer says the movement is a later replacement and the dial was refinished. Seller says both are original and offers a 2025 service invoice.',
  evidence: [
    { id: 'ev_1', source: 'Buyer', detail: 'Eight photographs of the dial, case-back stamp and movement.', receivedAt: '2026-10-20T08:14:00.000Z' },
    { id: 'ev_2', source: 'Buyer', detail: 'Independent watchmaker note: “movement serial is outside the 1972 range”.', receivedAt: '2026-10-21T09:05:00.000Z' },
    { id: 'ev_3', source: 'Seller', detail: 'Service invoice dated 12 June 2025, Cape Town watchmaker.', receivedAt: '2026-10-20T13:40:00.000Z' },
    { id: 'ev_4', source: 'Seller', detail: 'Original purchase receipt from 2019, seller name redacted by support.', receivedAt: '2026-10-20T13:42:00.000Z' },
    { id: 'ev_5', source: 'Courier', detail: 'Waybill and delivery photograph; packaging was intact.', receivedAt: '2026-10-20T10:20:00.000Z' },
    { id: 'ev_6', source: 'Platform', detail: 'Listing revision history: description changed once, 14 October.', receivedAt: '2026-10-20T08:20:00.000Z' },
  ] satisfies readonly EvidenceRow[],
  timeline: [
    { at: '2026-10-20T08:10:00.000Z', actor: 'Buyer', event: 'Dispute opened with eight photographs.' },
    { at: '2026-10-20T08:12:00.000Z', actor: 'Platform', event: 'R1,850 held from the seller payout.' },
    { at: '2026-10-20T13:40:00.000Z', actor: 'Seller', event: 'Service invoice and purchase receipt uploaded.' },
    { at: '2026-10-21T09:05:00.000Z', actor: 'Support', event: 'Buyer’s watchmaker note added to the file.' },
    { at: '2026-10-22T07:30:00.000Z', actor: 'Platform', event: 'Assigned to the dispute desk; seller response due tomorrow.' },
  ] satisfies readonly TimelineEntry[],
};

export interface RiskRow {
  readonly id: string;
  readonly subject: string;
  readonly signals: readonly string[];
  readonly score: number;
  readonly openedAt: string;
  readonly status: string;
  readonly assignee: string;
}

export const RISK_ROWS: readonly RiskRow[] = [
  { id: 'rsk_2026_5512', subject: '@sandton_time', signals: ['14 listings in 24h', 'Bank name mismatch'], score: 82, openedAt: '2026-10-22T06:40:00.000Z', status: 'Hold placed', assignee: 'Nomsa Nkosi' },
  { id: 'rsk_2026_5508', subject: '@quick_cash_cpt', signals: ['Chargeback ratio 6.2%'], score: 76, openedAt: '2026-10-22T05:55:00.000Z', status: 'New', assignee: 'Unassigned' },
  { id: 'rsk_2026_5501', subject: '@pixeljunk_jhb', signals: ['Device shared with three accounts'], score: 64, openedAt: '2026-10-21T18:20:00.000Z', status: 'Reviewing', assignee: 'Sipho Dlamini' },
  { id: 'rsk_2026_5497', subject: '@luxe_durban', signals: ['Destination changed three times in seven days'], score: 58, openedAt: '2026-10-21T15:10:00.000Z', status: 'Reviewing', assignee: 'Nomsa Nkosi' },
  { id: 'rsk_2026_5490', subject: '@karoo_house', signals: ['Price 40% below category median'], score: 44, openedAt: '2026-10-21T11:45:00.000Z', status: 'Cleared', assignee: 'Sipho Dlamini' },
  { id: 'rsk_2026_5484', subject: '@sneaker_swap_sa', signals: ['Four buyer complaints in 30 days'], score: 39, openedAt: '2026-10-20T16:30:00.000Z', status: 'Monitoring', assignee: 'Unassigned' },
];

export interface LinkedOrder {
  readonly orderId: string;
  readonly item: string;
  readonly amountCents: number;
  readonly state: string;
}

export const RISK_CASE = {
  id: 'rsk_2026_5512',
  handle: '@sandton_time',
  legalName: 'Sandton Timepieces (Pty) Ltd',
  joined: '2024-03-11',
  tier: 'T3 — Listing reviewed',
  sales: 212,
  disputeRate: '2.4%',
  payoutBank: 'FNB',
  payoutLast4: '4821',
  destinationChanged: '2026-10-21T19:05:00.000Z',
  signals: [
    { at: '2026-10-21T19:05:00.000Z', code: 'destination_change', detail: 'Payout destination changed to FNB •••• 4821.' },
    { at: '2026-10-22T05:40:00.000Z', code: 'velocity', detail: 'Fourteen watch listings created in 24 hours, all from one device.' },
    { at: '2026-10-22T06:10:00.000Z', code: 'name_mismatch', detail: 'Beneficiary name on the new destination differs from the account holder.' },
    { at: '2026-10-22T06:40:00.000Z', code: 'hold', detail: 'Platform placed a payout hold pending analyst review.' },
  ],
  linkedOrders: [
    { orderId: 'ord_2026_88421', item: 'Rolex Datejust 1601', amountCents: 1_850_000, state: 'Disputed — funds held' },
    { orderId: 'ord_2026_88398', item: 'Omega Seamaster 300', amountCents: 720_000, state: 'Delivered' },
    { orderId: 'ord_2026_88210', item: 'Tudor Black Bay 58', amountCents: 3_240_000, state: 'Awaiting dispatch' },
  ] satisfies readonly LinkedOrder[],
};
