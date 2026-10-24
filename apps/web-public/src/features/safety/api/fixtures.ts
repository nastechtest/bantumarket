import { money } from '@nastech/api-contracts';
import type {
  MutedSeller,
  ReportAck,
  ReportInput,
  ReviewRecord,
  SafetyTransport,
} from './safety-transport.js';
import { REPORT_QUEUE } from './safety-transport.js';

/**
 * In-memory transport for development, tests and the wired-up stub. Behaviour mirrors what the
 * real endpoints must do — including the honest parts: the ack always says the subject can see
 * the report, and the service target is a target.
 */

export const fixtureSubjects = {
  item: {
    kind: 'item',
    id: 'lst_01',
    label: 'Seiko “Presage” automatic, 40.5 mm — R4,200',
    reportedAccountId: 'acc_seller_thabo',
  },
  seller: {
    kind: 'seller',
    id: 'acc_seller_thabo',
    label: '@thabo.watches (Johannesburg, South Rand)',
    reportedAccountId: 'acc_seller_thabo',
  },
  order: {
    kind: 'order',
    id: 'ord_7741',
    label: 'Order ORD-7741 — Casio F-91W, R450, status HANDOVER_SCHEDULED',
    reportedAccountId: 'acc_seller_amahle',
  },
  handover: {
    kind: 'handover',
    id: 'hnd_2210',
    label: 'Handover for ORD-9002 — Citizen Eco-Drive, scheduled at Baywide parking, 14:30',
    reportedAccountId: 'acc_seller_jacques',
  },
} as const;

/** R amounts as cents, for the evidence fee examples. */
export const fixtureSaleExample = {
  title: 'Seiko “Presage” automatic, 40.5 mm',
  price: money(650_000), // R6,500
  fee: money(65_000), // 10 % success fee at COMPLETED
  payout: money(585_000),
};

const RECORDS: Record<string, ReviewRecord> = {
  lst_01: {
    listingId: 'lst_01',
    sellerTier: 'T4',
    entries: [
      {
        tier: 'T2',
        action:
          'Onboarding queue matched a green ID book photo to the profile photo, by eye, before the account could list.',
        notCovered:
          'Not a credit check. Not proof the person is honest. The match was made by a contract reviewer, not a forensic specialist.',
        performedByRole: 'Onboarding reviewer (contract staff)',
        at: '2026-06-11T09:24:00+02:00',
      },
      {
        tier: 'T3',
        action:
          'A reviewer read this listing’s text and photos against the prohibited-items and pricing policy before it went live.',
        notCovered:
          'They read the listing; they did not see the watch at that point. Nothing about the movement was assessed.',
        performedByRole: 'Listing review queue',
        at: '2026-08-02T13:05:00+02:00',
      },
      {
        tier: 'T4',
        action:
          'The physical watch was photographed and looked at by the capture team in the Cape Town studio (R270 capture run). Outer condition was compared against the seller’s written disclosures; the bezel hairline at 2 o’clock was added to the caption list.',
        notCovered:
          'No horologist was present. The movement was not opened, timekeeping was not measured, water resistance was not tested, and genuineness of the brand was not assessed.',
        performedByRole: 'Capture and QC team',
        at: '2026-08-05T11:40:00+02:00',
      },
    ],
  },
};

function reference(seq: number): string {
  return `RPT-${String(seq).padStart(6, '0')}`;
}

export function createFixtureTransport(options?: {
  failNextSubmit?: boolean;
  initialMutes?: readonly MutedSeller[];
}): SafetyTransport & { submittedReports: ReportInput[] } {
  const submitted: ReportInput[] = [];
  let mutes: MutedSeller[] = [...(options?.initialMutes ?? [])];
  let seq = 231;
  let failNext = options?.failNextSubmit ?? false;
  const now = () => new Date('2026-10-21T22:47:00+02:00').toISOString();

  return {
    submittedReports: submitted,
    async submitReport(input) {
      if (failNext) {
        failNext = false;
        throw new Error('network: report queue unreachable');
      }
      submitted.push(input);
      const ack: ReportAck = {
        reference: reference(++seq),
        receivedAt: now(),
        firstResponseTargetHours: REPORT_QUEUE.firstResponseTargetHours,
        queueOpensNote: REPORT_QUEUE.openingHours,
        visibleToSubject: true,
      };
      return ack;
    },
    async fetchReviewRecord(listingId) {
      const record = RECORDS[listingId];
      if (!record) throw new Error(`no review record for ${listingId}`);
      return record;
    },
    async listMutes() {
      return [...mutes];
    },
    async muteSeller(sellerAccountId, displayName) {
      const existing = mutes.find((m) => m.sellerAccountId === sellerAccountId);
      if (existing) return existing;
      const entry: MutedSeller = { sellerAccountId, displayName, mutedAt: now() };
      mutes = [...mutes, entry];
      return entry;
    },
    async unmuteSeller(sellerAccountId) {
      mutes = mutes.filter((m) => m.sellerAccountId !== sellerAccountId);
    },
  };
}

export const fixtureTransport = createFixtureTransport();
