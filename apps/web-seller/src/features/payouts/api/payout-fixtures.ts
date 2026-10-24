import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';

/** Payout facts as the seller sees them. Bank identifiers arrive already masked. */

export interface PayoutRun {
  readonly id: string;
  readonly runDate: string;
  readonly amount: Money;
  readonly state: 'paid' | 'returned' | 'scheduled';
  readonly destination: string;
  readonly note: string | null;
}

export const PAYOUT_ACCOUNT = {
  bank: 'FNB Business',
  accountType: 'Cheque',
  holder: 'P. van Wyk',
  maskedNumber: '•••• 4821',
  destination: 'FNB Business •••• 4821',
  confirmedAt: '2026-09-22T11:40:00+02:00',
} as const;

export const PAYABLE_NOW: Money = money(389_000);
export const HELD_FOR_BUYERS: Money = money(4_670_000);
export const DISPUTED: Money = money(6_450_000);
export const NEXT_RUN_DATE = '2026-10-19';

export const PAYOUT_RUNS: readonly PayoutRun[] = [
  {
    id: 'pay_2041',
    runDate: '2026-10-12',
    amount: money(389_000),
    state: 'returned',
    destination: PAYOUT_ACCOUNT.destination,
    note: 'The bank returned the payment: the account on file was closed.',
  },
  {
    id: 'pay_2038',
    runDate: '2026-10-05',
    amount: money(645_000),
    state: 'paid',
    destination: PAYOUT_ACCOUNT.destination,
    note: null,
  },
  {
    id: 'pay_2031',
    runDate: '2026-09-28',
    amount: money(270_000),
    state: 'paid',
    destination: PAYOUT_ACCOUNT.destination,
    note: null,
  },
  {
    id: 'pay_2044',
    runDate: NEXT_RUN_DATE,
    amount: PAYABLE_NOW,
    state: 'scheduled',
    destination: PAYOUT_ACCOUNT.destination,
    note: 'First retry of the returned amount.',
  },
];

export interface CaptureCharge {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly chargedAt: string;
  readonly amount: Money;
  readonly state: 'charged' | 'not charged';
}

export const CAPTURE_CHARGES: readonly CaptureCharge[] = [
  {
    id: 'cap_7001',
    listingId: 'lst_1002',
    listingTitle: 'Tudor Black Bay 58, navy bezel',
    chargedAt: '2026-10-14T08:30:00+02:00',
    amount: money(27_000),
    state: 'charged',
  },
  {
    id: 'cap_6994',
    listingId: 'lst_0981',
    listingTitle: 'Tissot PRX Powermatic 80',
    chargedAt: '2026-10-06T09:15:00+02:00',
    amount: money(27_000),
    state: 'charged',
  },
];
