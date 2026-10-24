import { money } from '@nastech/api-contracts';
import type { Cents } from '@nastech/api-contracts';
import type {
  AttentionItem,
  DashboardListing,
  DashboardOrder,
  DashboardSnapshot,
  DashboardTransport,
} from './dashboard-transport.js';
import { DashboardTransportError } from './dashboard-transport.js';

/**
 * Demo seller: one draft, one listing in review, two live listings, a paid order whose handover
 * has not been scheduled, and a failed payout. Every screen state the dashboard can render is
 * therefore reachable by clicking around the demo, and every fixture instant is an absolute SAST
 * string — the app never derives a money-relevant date from `Date.now()`.
 */

const C = (rands: number): Cents => money(Math.round(rands * 100)).cents;

const LISTING_IN_REVIEW: DashboardListing = {
  id: 'lst_1002',
  title: 'Tudor Black Bay 58, navy bezel',
  stage: 'in_review',
  price: money(4_250_000),
  submittedAt: '2026-10-14T09:20:00+02:00',
  wentLiveAt: null,
  review: {
    waitingOn: 'NasTech review',
    since: '2026-10-14T09:20:00+02:00',
    note: 'A reviewer checks the photographs and the condition record. Usually under 4 working hours.',
  },
};

const LISTING_DRAFT: DashboardListing = {
  id: 'lst_1001',
  title: 'Seiko Presage Cocktail Time',
  stage: 'draft',
  price: money(680_000),
  submittedAt: null,
  wentLiveAt: null,
  review: null,
};

const LISTING_LIVE: DashboardListing = {
  id: 'lst_0990',
  title: 'Omega Seamaster 300M, 2019',
  stage: 'live',
  price: money(6_450_000),
  submittedAt: '2026-10-02T11:00:00+02:00',
  wentLiveAt: '2026-10-02T15:12:00+02:00',
  review: null,
};

export const FIXTURE_ATTENTION: readonly AttentionItem[] = [
  {
    id: 'att_handover_01',
    kind: 'handover_unscheduled',
    title: 'Schedule the handover for order NTM-1042',
    detail: 'The buyer has paid R4,200. The money is held until you both confirm the exchange.',
    href: '/orders/ord_1042',
    dueAt: '2026-10-17T18:00:00+02:00',
    blockingValue: C(4200),
  },
  {
    id: 'att_payout_01',
    kind: 'payout_failed',
    title: 'Your payout of R3,890 was returned by the bank',
    detail: 'The account number on file was closed. Update it and we will retry automatically.',
    href: '/payouts',
    dueAt: null,
    blockingValue: C(3890),
  },
  {
    id: 'att_review_01',
    kind: 'listing_in_review',
    title: 'Tudor Black Bay 58 is with the NasTech reviewer',
    detail: 'No action needed from you. A reviewer checks the photographs and the condition record.',
    href: '/listings/lst_1002',
    dueAt: null,
    blockingValue: C(0),
  },
  {
    id: 'att_draft_01',
    kind: 'draft_unfinished',
    title: 'Finish the Seiko Presage draft',
    detail: 'Two steps left: the condition record and photographs.',
    href: '/listings/new?draft=lst_1001',
    dueAt: null,
    blockingValue: C(0),
  },
  {
    id: 'att_question_01',
    kind: 'question_unanswered',
    title: 'Nomsa asked about the Omega Seamaster',
    detail: '“Does it come with the original box and papers?”',
    href: '/messages/thr_2001',
    dueAt: null,
    blockingValue: C(0),
  },
];

export const DEMO_DASHBOARD: DashboardSnapshot = {
  seller: {
    displayName: 'Pieter',
    tier: 'T2',
    joinedAt: '2026-09-20T08:00:00+02:00',
  },
  listings: {
    byStage: {
      draft: 1,
      in_review: 1,
      live: 1,
      paused: 0,
      withdrawn: 0,
      expired: 0,
      sold: 1,
      rejected: 0,
    },
    recent: [LISTING_DRAFT, LISTING_IN_REVIEW, LISTING_LIVE],
  },
  orders: {
    waitingOnYou: 1,
    moneyHeld: money(420_000),
    recent: [
      {
        id: 'ord_1042',
        listingId: 'lst_0981',
        listingTitle: 'Tissot PRX Powermatic 80',
        state: 'PAID',
        amount: money(420_000),
        handoverAt: null,
        buyerName: 'Nomsa',
      },
      {
        id: 'ord_1010',
        listingId: 'lst_0971',
        listingTitle: 'Hamilton Khaki Field Mechanical',
        state: 'COMPLETED',
        amount: money(389_000),
        handoverAt: '2026-10-08T14:30:00+02:00',
        buyerName: 'Thabo',
      },
    ] satisfies readonly DashboardOrder[],
  },
  payout: {
    payable: money(0),
    pending: money(389_000),
    nextPayoutDate: '2026-10-19',
    status: 'failed',
    failedReason: 'The bank returned the payment: account closed.',
  },
  capture: {
    listingId: 'lst_0981',
    listingTitle: 'Tissot PRX Powermatic 80',
    jobState: 'qc_human',
    updatedAt: '2026-10-15T10:05:00+02:00',
    operatorNote: null,
  },
  attention: FIXTURE_ATTENTION,
  firstListingAt: '2026-09-21T19:40:00+02:00',
  firstWentLiveAt: '2026-09-23T09:05:00+02:00',
};

/** A seller who has not listed anything: the dashboard must open with a real first step. */
export const EMPTY_DASHBOARD: DashboardSnapshot = {
  seller: { displayName: 'Pieter', tier: 'T1', joinedAt: '2026-10-01T08:00:00+02:00' },
  listings: {
    byStage: { draft: 0, in_review: 0, live: 0, paused: 0, withdrawn: 0, expired: 0, sold: 0, rejected: 0 },
    recent: [],
  },
  orders: { waitingOnYou: 0, moneyHeld: money(0), recent: [] },
  payout: { payable: money(0), pending: money(0), nextPayoutDate: null, status: 'none', failedReason: null },
  capture: null,
  attention: [],
  firstListingAt: null,
  firstWentLiveAt: null,
};

export interface FixtureOptions {
  readonly snapshot?: DashboardSnapshot;
  /** ms; 0 resolves on the next microtask, which is what tests use. */
  readonly latencyMs?: number;
  /** Number of loads that reject before succeeding. */
  readonly failuresBeforeSuccess?: number;
  readonly errorMessage?: string;
}

export interface FixtureDashboardTransport extends DashboardTransport {
  readonly loads: () => number;
  setSnapshot(next: DashboardSnapshot): void;
}

export function createDashboardFixture(options: FixtureOptions = {}): FixtureDashboardTransport {
  let snapshot = options.snapshot ?? DEMO_DASHBOARD;
  let failures = options.failuresBeforeSuccess ?? 0;
  let loads = 0;
  const latency = options.latencyMs ?? 0;
  const message = options.errorMessage ?? 'The dashboard could not load. Check your connection.';

  async function wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }

  return {
    loads: () => loads,
    setSnapshot(next) {
      snapshot = next;
    },
    async load(signal) {
      loads += 1;
      await wait(latency, signal);
      if (failures > 0) {
        failures -= 1;
        throw new DashboardTransportError(message, true);
      }
      return snapshot;
    },
  };
}
