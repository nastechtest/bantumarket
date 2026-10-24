/** Money, audit, privacy and account fixtures. Amounts are integer cents throughout. */

export interface PayoutBatch {
  readonly id: string;
  readonly seller: string;
  readonly bank: string;
  readonly last4: string;
  readonly amountCents: number;
  readonly requestedAt: string;
  readonly status: string;
  readonly preparedBy: string;
  readonly orderCount: number;
}

export const PAYOUT_BATCHES: readonly PayoutBatch[] = [
  { id: 'pay_2026_1042', seller: '@sandton_time', bank: 'FNB', last4: '4821', amountCents: 4_825_000, requestedAt: '2026-10-22T06:00:00.000Z', status: 'Prepared', preparedBy: 'Lindiwe Mahlangu', orderCount: 6 },
  { id: 'pay_2026_1041', seller: '@capevintage_co', bank: 'Capitec', last4: '9073', amountCents: 1_248_000, requestedAt: '2026-10-22T05:40:00.000Z', status: 'Awaiting release', preparedBy: 'Lindiwe Mahlangu', orderCount: 4 },
  { id: 'pay_2026_1039', seller: '@pixeljunk_jhb', bank: 'Absa', last4: '3310', amountCents: 792_000, requestedAt: '2026-10-21T16:15:00.000Z', status: 'Released', preparedBy: 'Thabo Molefe', orderCount: 3 },
  { id: 'pay_2026_1036', seller: '@karoo_house', bank: 'Standard Bank', last4: '2205', amountCents: 3_160_000, requestedAt: '2026-10-21T14:00:00.000Z', status: 'On hold', preparedBy: 'Thabo Molefe', orderCount: 5 },
  { id: 'pay_2026_1031', seller: '@film_supply_ct', bank: 'Nedbank', last4: '7742', amountCents: 534_000, requestedAt: '2026-10-21T09:30:00.000Z', status: 'Failed', preparedBy: 'Lindiwe Mahlangu', orderCount: 2 },
];

export interface PayoutReview {
  readonly id: string;
  readonly seller: string;
  readonly sellerName: string;
  readonly bank: string;
  readonly last4: string;
  readonly amountCents: number;
  readonly requestedAt: string;
  readonly preparedBy: string;
  readonly preparedByRole: string;
  readonly preparedAt: string;
  readonly verifiedAt: string;
  readonly orderCount: number;
  readonly holdNote: string;
}

export const PAYOUT_REVIEW: PayoutReview = {
  id: 'pay_2026_1042',
  seller: '@sandton_time',
  sellerName: 'Sandton Timepieces',
  bank: 'FNB',
  last4: '4821',
  amountCents: 4_825_000,
  requestedAt: '2026-10-22T06:00:00.000Z',
  preparedBy: 'Lindiwe Mahlangu',
  preparedByRole: 'Finance preparer',
  preparedAt: '2026-10-22T06:14:00.000Z',
  verifiedAt: '2026-10-12T10:20:00.000Z',
  orderCount: 6,
  holdNote: 'Destination was verified on 12 October. No destination change in the last 30 days.',
};

export interface ReconciliationBreak {
  readonly id: string;
  readonly provider: string;
  readonly providerRef: string;
  readonly orderId: string;
  readonly expectedCents: number;
  readonly capturedCents: number;
  readonly varianceCents: number;
  readonly age: string;
  readonly status: string;
}

export const RECONCILIATION_BREAKS: readonly ReconciliationBreak[] = [
  { id: 'brk_2026_7741', provider: 'Peach', providerRef: 'PG-993102', orderId: 'ord_2026_88398', expectedCents: 720_000, capturedCents: 700_000, varianceCents: -20_000, age: '9h', status: 'Short capture' },
  { id: 'brk_2026_7738', provider: 'Peach', providerRef: 'PG-993088', orderId: 'ord_2026_88377', expectedCents: 125_000, capturedCents: 125_000, varianceCents: 0, age: '1d', status: 'Duplicate settlement' },
  { id: 'brk_2026_7732', provider: 'PayFast', providerRef: 'PF-441907', orderId: 'ord_2026_88302', expectedCents: 240_000, capturedCents: 0, varianceCents: -240_000, age: '2d', status: 'Missing settlement' },
  { id: 'brk_2026_7729', provider: 'Yoco', providerRef: 'YC-118204', orderId: 'ord_2026_88255', expectedCents: 310_000, capturedCents: 310_000, varianceCents: 0, age: '2d', status: 'Fee charged twice' },
  { id: 'brk_2026_7721', provider: 'PayGate', providerRef: 'PY-775031', orderId: 'ord_2026_88190', expectedCents: 680_000, capturedCents: 680_000, varianceCents: 0, age: '3d', status: 'Matched late' },
  { id: 'brk_2026_7714', provider: 'Peach', providerRef: 'PG-992744', orderId: 'ord_2026_88144', expectedCents: 145_000, capturedCents: 143_500, varianceCents: -1_500, age: '4d', status: 'Fee mismatch' },
];

export interface AuditEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly role: string;
  readonly action: string;
  readonly target: string;
  readonly reason: string;
  readonly outcome: 'allowed' | 'denied';
}

export const AUDIT_ENTRIES: readonly AuditEntry[] = [
  { id: 'aud_2026_99012', at: '2026-10-22T08:42:00.000Z', actor: 'Naledi Khumalo', role: 'finance_checker', action: 'release_payout', target: 'pay_2026_1039', reason: 'Second checker release after bank details were verified', outcome: 'allowed' },
  { id: 'aud_2026_99008', at: '2026-10-22T08:17:00.000Z', actor: 'Sipho Dlamini', role: 'risk_analyst', action: 'place_hold', target: 'rsk_2026_5512', reason: 'Velocity and beneficiary name mismatch reviewed', outcome: 'allowed' },
  { id: 'aud_2026_99001', at: '2026-10-22T07:55:00.000Z', actor: 'Thandi Mokoena', role: 'reviewer', action: 'approve_listing', target: 'lst_2026_0469', reason: 'Photos are original and the description matches condition', outcome: 'allowed' },
  { id: 'aud_2026_98994', at: '2026-10-22T07:31:00.000Z', actor: 'Lindiwe Mahlangu', role: 'finance_maker', action: 'prepare_payout', target: 'pay_2026_1042', reason: 'Six orders cleared the payout hold window', outcome: 'allowed' },
  { id: 'aud_2026_98987', at: '2026-10-22T07:12:00.000Z', actor: 'Nomsa Nkosi', role: 'qc_reviewer', action: 'pass_capture_qc', target: 'cap_2026_0912', reason: 'Six angles, scale marker and colour card all present', outcome: 'allowed' },
  { id: 'aud_2026_98979', at: '2026-10-22T06:48:00.000Z', actor: 'Thabo Molefe', role: 'finance_checker', action: 'release_payout', target: 'pay_2026_1041', reason: 'Refused: preparer and releaser were the same operator', outcome: 'denied' },
  { id: 'aud_2026_98971', at: '2026-10-22T06:20:00.000Z', actor: 'Ayanda Ndlovu', role: 'capture_operator', action: 'rebook_capture', target: 'cap_2026_0901', reason: 'Lens calibration failed; rebooked to 24 October', outcome: 'allowed' },
  { id: 'aud_2026_98964', at: '2026-10-22T05:58:00.000Z', actor: 'Zanele Nkosi', role: 'privacy_officer', action: 'record_popia_decision', target: 'pop_2026_031', reason: 'Erasure partly refused under five-year financial retention', outcome: 'allowed' },
];

export interface PopiaRow {
  readonly id: string;
  readonly requester: string;
  readonly type: 'Erasure' | 'Access' | 'Correction' | 'Objection';
  readonly receivedAt: string;
  readonly dueAt: string;
  readonly status: string;
}

export const POPIA_ROWS: readonly PopiaRow[] = [
  { id: 'pop_2026_031', requester: '@naledi_m', type: 'Erasure', receivedAt: '2026-10-18T09:30:00.000Z', dueAt: '2026-11-17T09:30:00.000Z', status: 'Decision due' },
  { id: 'pop_2026_029', requester: '@riaan_b', type: 'Access', receivedAt: '2026-10-15T11:10:00.000Z', dueAt: '2026-11-14T11:10:00.000Z', status: 'Identity verified' },
  { id: 'pop_2026_027', requester: '@fatima_p', type: 'Correction', receivedAt: '2026-10-12T08:05:00.000Z', dueAt: '2026-11-11T08:05:00.000Z', status: 'Awaiting customer' },
  { id: 'pop_2026_024', requester: '@jozi_finds', type: 'Objection', receivedAt: '2026-10-08T14:45:00.000Z', dueAt: '2026-11-07T14:45:00.000Z', status: 'With legal' },
  { id: 'pop_2026_019', requester: '@zanele_n', type: 'Erasure', receivedAt: '2026-10-01T10:20:00.000Z', dueAt: '2026-10-31T10:20:00.000Z', status: 'Partially refused' },
];

export interface RetentionRow {
  readonly dataClass: string;
  readonly decision: 'Erase' | 'Retain';
  readonly basis: string;
  readonly until: string;
}

export const POPIA_CASE = {
  id: 'pop_2026_031',
  requester: '@naledi_m',
  requesterName: 'Naledi Mahlangu',
  type: 'Erasure',
  receivedAt: '2026-10-18T09:30:00.000Z',
  dueAt: '2026-11-17T09:30:00.000Z',
  scope: ['Profile and contact details', 'Order history', 'Saved delivery addresses', 'Messages with sellers'],
  note: 'Identity verified by a one-time link on 19 October. No open dispute and no unpaid balance.',
  retention: [
    { dataClass: 'Financial records (invoices, payout lines)', decision: 'Retain', basis: 'FICA and Tax Administration Act', until: 'Five years after the last transaction' },
    { dataClass: 'Dispute evidence', decision: 'Retain', basis: 'Consumer Protection Act', until: 'Three years after the case closes' },
    { dataClass: 'Consent and marketing records', decision: 'Retain', basis: 'POPIA accountability', until: 'Five years after consent is withdrawn' },
    { dataClass: 'Profile and preferences', decision: 'Erase', basis: 'No legal retention duty', until: 'On decision' },
    { dataClass: 'Messages not linked to a dispute', decision: 'Erase', basis: 'No legal retention duty', until: 'On decision' },
  ] satisfies readonly RetentionRow[],
};

export interface UserRow {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly kind: 'Buyer' | 'Seller';
  readonly joined: string;
  readonly tier: string;
  readonly activity: string;
  readonly status: string;
}

export const USER_ROWS: readonly UserRow[] = [
  { id: 'usr_4821', handle: '@naledi_m', name: 'Naledi Mahlangu', kind: 'Buyer', joined: '2024-02-14', tier: 'T2', activity: '23 orders', status: 'Active' },
  { id: 'usr_5104', handle: '@sandton_time', name: 'Sandton Timepieces', kind: 'Seller', joined: '2023-08-02', tier: 'T4', activity: '212 sales', status: 'Selling limited' },
  { id: 'usr_4988', handle: '@sipho_d', name: 'Sipho Dlamini', kind: 'Buyer', joined: '2024-06-19', tier: 'T2', activity: '8 orders', status: 'Active' },
  { id: 'usr_4877', handle: '@capevintage_co', name: 'Cape Vintage Co.', kind: 'Seller', joined: '2024-01-11', tier: 'T3', activity: '96 sales', status: 'Active' },
  { id: 'usr_5120', handle: '@quick_cash_cpt', name: 'Quick Cash CPT', kind: 'Seller', joined: '2026-09-28', tier: 'T1', activity: '3 sales', status: 'Under review' },
  { id: 'usr_4790', handle: '@pixeljunk_jhb', name: 'Pixel Junk JHB', kind: 'Seller', joined: '2023-11-05', tier: 'T4', activity: '141 sales', status: 'Active' },
  { id: 'usr_5033', handle: '@lerato_m', name: 'Lerato Molefe', kind: 'Buyer', joined: '2024-09-30', tier: 'T2', activity: '17 orders', status: 'Active' },
  { id: 'usr_5155', handle: '@karoo_house', name: 'Karoo House', kind: 'Seller', joined: '2022-05-16', tier: 'T5', activity: '308 sales', status: 'Active' },
];

export const USER_DETAIL = {
  id: 'usr_5104',
  handle: '@sandton_time',
  name: 'Sandton Timepieces (Pty) Ltd',
  kind: 'Seller',
  joined: '2023-08-02',
  tier: 'T4 — Item inspected',
  sales: 212,
  disputeRate: '2.4%',
  rating: '4.7 / 5',
  payoutBank: 'FNB',
  payoutLast4: '4821',
  linkedRiskCase: 'rsk_2026_5512',
  lastActive: '2026-10-22T08:05:00.000Z',
};
