/**
 * Pilot fixtures for the item page. These are dev/test data, not a parallel truth: the shape comes
 * from `item-transport.ts`, the money through the contract's `money()` constructor, and the copy
 * is written to be honest about what a photograph of a used watch can say.
 *
 * The condition texts below mirror what a capture's disclosure records would contain; the real
 * records come from the manifest endpoint and the dispute process reads those, never this file.
 */

import { money } from '@nastech/api-contracts';
import type { ItemDetail, ItemTransport, QuestionOutcome, ReportOutcome } from './item-transport.js';
import { ItemRequestError, isReportReason } from './item-transport.js';

const presage: ItemDetail = {
  listingId: 'lst_01',
  title: 'Seiko “Presage” automatic, 40.5 mm',
  description:
    'My previous watch, worn weekends for two years. Keeps time well for me — I have not had it serviced and I am not claiming it has. Case serial matches the movement plate. One hairline at 2 o’clock, crystal replaced. Sold with the box and two links removed from the bracelet.',
  price: money(420_000),
  categorySlug: 'pre-owned-watches',
  seller: {
    displayName: 'Thandi M.',
    tier: 'T4',
    memberSince: '2025-11-04',
    city: 'Johannesburg',
    typicalResponseHours: 3,
  },
  poster: { id: 'img_poster', url: '/fixtures/item/lst_01/poster.jpg', alt: 'Seiko Presage on a dark mat, dial facing the camera', widthPx: 1200, heightPx: 1200 },
  stills: [
    { id: 'img_caseback', url: '/fixtures/item/lst_01/caseback.jpg', alt: 'Case back with the serial engraved, readable under raking light', widthPx: 1200, heightPx: 1200 },
    { id: 'img_bezel2', url: '/fixtures/item/lst_01/bezel-2oclock.jpg', alt: 'Close-up of the bezel at 2 o’clock showing one hairline scratch', widthPx: 1600, heightPx: 1600 },
    { id: 'img_clasp', url: '/fixtures/item/lst_01/clasp.jpg', alt: 'Bracelet clasp, slightly polished from wear', widthPx: 1200, heightPx: 1200 },
    { id: 'img_wrist', url: '/fixtures/item/lst_01/wrist.jpg', alt: 'The watch on a wrist, dial readable at arm length', widthPx: 1080, heightPx: 1350 },
  ],
  turntable: { kind: 'strip', stripUrl: '/fixtures/item/lst_01/turntable-12.jpg', frames: 12 },
  has3d: true,
  claimScope: 'geometry_and_external_condition',
  conditionRecords: [
    {
      disclosureId: 'dis_01',
      text: 'One hairline at 2 o’clock on the bezel. Visible only under raking light.',
      severity: 'cosmetic',
      location: 'bezel, 2 o’clock',
      hotspotId: 'hs_bezel',
    },
    {
      disclosureId: 'dis_02',
      text: 'Crystal replaced by the previous owner. Not original; no effect on timekeeping claimed by seller, not verified by us.',
      severity: 'unknown',
      location: 'crystal',
      hotspotId: 'hs_crystal',
    },
    {
      disclosureId: 'dis_03',
      text: 'Clasp polished from wear; the finishing marks are even, not a single deep scratch.',
      severity: 'cosmetic',
      location: 'clasp',
    },
  ],
  listedAt: '2026-09-30T08:15:00Z',
  inStock: true,
};

const f91w: ItemDetail = {
  listingId: 'lst_02',
  title: 'Casio F-91W, boxed',
  description:
    'Everyday beater, battery changed in June. Screen has no scratches I can find; the strap is worn and I would replace it. Nothing else to declare.',
  price: money(45_000),
  categorySlug: 'pre-owned-watches',
  seller: {
    displayName: 'Sipho K.',
    tier: 'T2',
    memberSince: '2026-02-17',
    city: 'Johannesburg',
    typicalResponseHours: null,
  },
  poster: { id: 'img_poster', url: '/fixtures/item/lst_02/poster.jpg', alt: 'Casio F-91W beside its box', widthPx: 1200, heightPx: 1200 },
  stills: [
    { id: 'img_strap', url: '/fixtures/item/lst_02/strap.jpg', alt: 'The worn resin strap, buckhole stretch visible', widthPx: 1200, heightPx: 1200 },
  ],
  turntable: null,
  has3d: false,
  // No capture and no model exist for this listing. The page renders no claim-scope sentence for it;
  // the scope is kept on the DTO so the type never goes optional (an absent scope invites a guess).
  claimScope: 'none',
  conditionRecords: [
    { disclosureId: 'dis_11', text: 'Strap worn; buyer should budget for a replacement strap.', severity: 'cosmetic', location: 'strap' },
  ],
  listedAt: '2026-10-02T14:40:00Z',
  inStock: true,
};

const ecoDrive: ItemDetail = {
  listingId: 'lst_03',
  title: 'Citizen Eco-Drive titanium',
  description:
    'Bought new in 2019, charged weekly, holds a full day on a partial charge. One dent on the case side, photographed below. Titanium bracelet has stretched slightly with wear.',
  price: money(310_000),
  categorySlug: 'pre-owned-watches',
  seller: {
    displayName: 'Aisha P.',
    tier: 'T3',
    memberSince: '2025-06-01',
    city: 'Johannesburg',
    typicalResponseHours: 26,
  },
  poster: { id: 'img_poster', url: '/fixtures/item/lst_03/poster.jpg', alt: 'Citizen Eco-Drive titanium on a white surface', widthPx: 1200, heightPx: 1200 },
  stills: [
    { id: 'img_dent', url: '/fixtures/item/lst_03/dent.jpg', alt: 'Dent on the right side of the case, next to the crown', widthPx: 1600, heightPx: 1600 },
    { id: 'img_dial', url: '/fixtures/item/lst_03/dial.jpg', alt: 'Dial and hands, legible at arm length', widthPx: 1200, heightPx: 1200 },
  ],
  turntable: {
    kind: 'sequence',
    urls: Array.from({ length: 12 }, (_, i) => `/fixtures/item/lst_03/frame-${String(i).padStart(2, '0')}.jpg`),
  },
  has3d: false,
  claimScope: 'condition_only',
  conditionRecords: [
    { disclosureId: 'dis_21', text: 'Dent on the case side at 4 o’clock; the crystal is unaffected.', severity: 'cosmetic', location: 'case, 4 o’clock', hotspotId: 'hs_dent' },
    { disclosureId: 'dis_22', text: 'Bracelet stretch measured by the seller at two link gaps; not checked by us.', severity: 'unknown', location: 'bracelet' },
  ],
  listedAt: '2026-10-05T09:05:00Z',
  inStock: false,
};

export const fixtureDetails: readonly ItemDetail[] = [presage, f91w, ecoDrive];

export function fixtureDetail(listingId: string): ItemDetail | undefined {
  return fixtureDetails.find((d) => d.listingId === listingId);
}

export interface FixtureTransportOptions {
  /** Deterministic hook for tests that must see the loading state. Default: resolve immediately. */
  readonly delayMs?: number;
  /** Force question/report outcomes for tests. */
  readonly questionHandler?: (question: string) => QuestionOutcome;
  readonly reportHandler?: (reason: string) => ReportOutcome;
}

/**
 * The pilot default. Deliberately in-memory and synchronous-by-default: every flow on this page —
 * inspect, ask, buy, report — must complete with no network and no WebGL, which is the product
 * rule, not a convenience.
 */
export function createFixtureItemTransport(options: FixtureTransportOptions = {}): ItemTransport {
  const wait = () => (options.delayMs !== undefined && options.delayMs > 0 ? sleep(options.delayMs) : Promise.resolve());
  return {
    async getDetail(listingId) {
      await wait();
      const found = fixtureDetail(listingId);
      if (found === undefined) throw new ItemRequestError('not_found');
      return found;
    },
    async askQuestion(listingId, question) {
      await wait();
      if (fixtureDetail(listingId) === undefined) throw new ItemRequestError('not_found');
      if (options.questionHandler !== undefined) return options.questionHandler(question);
      return question.trim().length >= 4 ? { kind: 'queued' } : { kind: 'rejected', reason: 'Write a little more so the seller can answer it.' };
    },
    async reportListing(listingId, reason) {
      await wait();
      if (fixtureDetail(listingId) === undefined) throw new ItemRequestError('not_found');
      if (!isReportReason(reason)) throw new ItemRequestError('validation');
      if (options.reportHandler !== undefined) return options.reportHandler(reason);
      return { kind: 'received' };
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
