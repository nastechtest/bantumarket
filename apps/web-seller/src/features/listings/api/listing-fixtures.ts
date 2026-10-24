import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';

/** Fixtures for the seller's own listings. Amounts are integer cents and display via MoneyText. */

export type ListingStage = 'draft' | 'in_review' | 'live' | 'paused' | 'sold';

export type CaptureState = 'none' | 'booked' | 'captured' | 'qc_auto' | 'qc_human' | 'published' | 'failed';

export interface ListingPhoto {
  readonly label: string;
  readonly requirement: string;
  readonly taken: boolean;
}

export interface Listing {
  readonly id: string;
  readonly title: string;
  readonly brand: string;
  readonly model: string;
  readonly reference: string;
  readonly year: number;
  readonly caseSizeMm: number;
  readonly movement: string;
  readonly price: Money;
  readonly stage: ListingStage;
  readonly capture: CaptureState;
  readonly description: string;
  readonly condition: {
    readonly overall: string;
    readonly case: string;
    readonly crystal: string;
    readonly bracelet: string;
    readonly notes: string;
  };
  readonly includes: {
    readonly box: boolean;
    readonly papers: boolean;
    readonly serviceHistory: string;
  };
  readonly photos: readonly ListingPhoto[];
  readonly updatedAt: string;
  readonly submittedAt: string | null;
}

const PHOTOS: readonly ListingPhoto[] = [
  { label: 'Dial, straight on', requirement: 'No glare across the hands', taken: true },
  { label: 'Case back', requirement: 'Reference and serial legible', taken: true },
  { label: 'Clasp and bracelet', requirement: 'Any stretch or mark visible', taken: true },
  { label: 'Disclosed marks', requirement: 'One close-up per mark', taken: false },
];

export const LISTINGS: readonly Listing[] = [
  {
    id: 'lst_1002',
    title: 'Tudor Black Bay 58, navy bezel',
    brand: 'Tudor',
    model: 'Black Bay 58',
    reference: '79030B',
    year: 2021,
    caseSizeMm: 39,
    movement: 'Automatic, MT5402',
    price: money(4_250_000),
    stage: 'in_review',
    capture: 'qc_human',
    description:
      'Navy dial and bezel, worn on weekends. Full bracelet with spare links. The bezel insert has one hairline at 2 o’clock, photographed and disclosed.',
    condition: {
      overall: 'Very good',
      case: 'Light swirls on the polished flank; no dents.',
      crystal: 'No scratches visible under a lamp.',
      bracelet: 'Tight, minor desk marks on the clasp.',
      notes: 'Bezel hairline at 2 o’clock. Running within +4 seconds a day over three days.',
    },
    includes: { box: true, papers: true, serviceHistory: 'No service; running within spec.' },
    photos: PHOTOS,
    updatedAt: '2026-10-14T09:20:00+02:00',
    submittedAt: '2026-10-14T09:20:00+02:00',
  },
  {
    id: 'lst_0981',
    title: 'Tissot PRX Powermatic 80',
    brand: 'Tissot',
    model: 'PRX Powermatic 80',
    reference: 'T137.407.11.041.00',
    year: 2023,
    caseSizeMm: 40,
    movement: 'Automatic, Powermatic 80.111',
    price: money(420_000),
    stage: 'live',
    capture: 'qc_human',
    description:
      'Blue dial on the integrated bracelet. Bought new in 2023 and worn in rotation. Keeps good time and comes with the original box.',
    condition: {
      overall: 'Good',
      case: 'Fine scratches on the bezel edge.',
      crystal: 'Clear.',
      bracelet: 'Two links removed, both included.',
      notes: 'A small scuff on the clasp, shown in the fourth photo.',
    },
    includes: { box: true, papers: false, serviceHistory: 'Not serviced; 2023 purchase.' },
    photos: PHOTOS,
    updatedAt: '2026-10-15T10:05:00+02:00',
    submittedAt: '2026-10-06T16:40:00+02:00',
  },
  {
    id: 'lst_0990',
    title: 'Omega Seamaster 300M, 2019',
    brand: 'Omega',
    model: 'Seamaster Diver 300M',
    reference: '210.30.42.20.03.001',
    year: 2019,
    caseSizeMm: 42,
    movement: 'Automatic, Co-Axial 8800',
    price: money(6_450_000),
    stage: 'live',
    capture: 'published',
    description:
      'Blue ceramic dial with the wave pattern, on the steel bracelet. Serviced by an independent watchmaker in Cape Town in 2024; the card is in the box.',
    condition: {
      overall: 'Very good',
      case: 'Sharp lugs, minimal polishing.',
      crystal: 'Clear, no chips.',
      bracelet: 'Full length with all links.',
      notes: 'Service card dated March 2024. Helium escape valve untested by us.',
    },
    includes: { box: true, papers: true, serviceHistory: 'Serviced March 2024, card included.' },
    photos: PHOTOS,
    updatedAt: '2026-10-02T15:12:00+02:00',
    submittedAt: '2026-10-01T12:10:00+02:00',
  },
  {
    id: 'lst_1001',
    title: 'Seiko Presage Cocktail Time',
    brand: 'Seiko',
    model: 'Presage Cocktail Time',
    reference: 'SRPB41J1',
    year: 2022,
    caseSizeMm: 40.5,
    movement: 'Automatic, 4R35',
    price: money(680_000),
    stage: 'draft',
    capture: 'none',
    description:
      'Blue cocktail dial with the fan texture. Two steps left: finish the condition record and add the clasp photograph.',
    condition: {
      overall: 'Good',
      case: 'Light wear on the bezel.',
      crystal: 'One faint hairline near 4 o’clock.',
      bracelet: 'Aftermarket leather strap fitted; original bracelet included.',
      notes: '',
    },
    includes: { box: true, papers: false, serviceHistory: 'Unknown; bought second-hand in 2024.' },
    photos: PHOTOS,
    updatedAt: '2026-10-13T18:30:00+02:00',
    submittedAt: null,
  },
  {
    id: 'lst_0971',
    title: 'Hamilton Khaki Field Mechanical',
    brand: 'Hamilton',
    model: 'Khaki Field Mechanical',
    reference: 'H69439931',
    year: 2020,
    caseSizeMm: 38,
    movement: 'Hand-wound, H-50',
    price: money(389_000),
    stage: 'sold',
    capture: 'none',
    description: 'Sold on 8 October 2026 to @thabo.k. Sandblasted case on a canvas strap.',
    condition: {
      overall: 'Good',
      case: 'Even wear, no dents.',
      crystal: 'Clear.',
      bracelet: 'Canvas strap with light fraying at the keepers.',
      notes: 'Sold with the original box.',
    },
    includes: { box: true, papers: false, serviceHistory: 'Not serviced.' },
    photos: PHOTOS,
    updatedAt: '2026-10-08T14:30:00+02:00',
    submittedAt: '2026-09-28T09:15:00+02:00',
  },
];

export function listingById(id: string | null): Listing | null {
  if (id === null) return null;
  return LISTINGS.find((listing) => listing.id === id) ?? null;
}

export const STAGE_LABELS: Readonly<Record<ListingStage, string>> = {
  draft: 'Draft',
  in_review: 'In review',
  live: 'Live',
  paused: 'Paused',
  sold: 'Sold',
};

export const STAGE_TONES: Readonly<Record<ListingStage, 'neutral' | 'progress' | 'success' | 'caution'>> = {
  draft: 'neutral',
  in_review: 'progress',
  live: 'success',
  paused: 'caution',
  sold: 'neutral',
};

export function captureLabel(state: CaptureState): string {
  switch (state) {
    case 'published':
      return '3D preview live';
    case 'qc_human':
      return '3D in review';
    case 'qc_auto':
      return '3D automatic checks';
    case 'captured':
      return '3D captured';
    case 'booked':
      return '3D booked';
    case 'failed':
      return '3D not produced';
    case 'none':
      return 'Photos only';
  }
}

export function captureTone(state: CaptureState): 'neutral' | 'progress' | 'success' | 'problem' {
  if (state === 'published') return 'success';
  if (state === 'qc_human' || state === 'qc_auto' || state === 'captured' || state === 'booked') return 'progress';
  if (state === 'failed') return 'problem';
  return 'neutral';
}

/** One capture job, used by both the detail screen and the capture review route. */
export interface CaptureJob {
  readonly listingId: string;
  readonly state: CaptureState;
  readonly studio: string;
  readonly bookedAt: string;
  readonly updatedAt: string;
  readonly framesCaptured: number;
  readonly framesRequired: number;
  readonly turntableCalibrated: boolean;
  readonly referenceInFrame: boolean;
  readonly operatorNote: string | null;
  readonly qcChecks: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    readonly state: 'passed' | 'current' | 'waiting';
  }[];
}

export const CAPTURE_JOB: CaptureJob = {
  listingId: 'lst_1002',
  state: 'qc_human',
  studio: 'Cape Town studio, Salt River',
  bookedAt: '2026-10-14T08:30:00+02:00',
  updatedAt: '2026-10-15T10:05:00+02:00',
  framesCaptured: 360,
  framesRequired: 360,
  turntableCalibrated: true,
  referenceInFrame: true,
  operatorNote: null,
  qcChecks: [
    { id: 'qc_alignment', label: 'Turntable calibrated', detail: 'Level and centring checked against the 50 mm reference bar.', state: 'passed' },
    { id: 'qc_reference', label: 'Reference object in frame', detail: 'A 50 mm bar stayed visible for all 360 frames.', state: 'passed' },
    { id: 'qc_frames', label: '360 frames captured', detail: 'One frame every degree; none dropped or duplicated.', state: 'passed' },
    { id: 'qc_auto', label: 'Automatic checks', detail: 'Lighting, focus, occlusion and background checks passed.', state: 'passed' },
    { id: 'qc_human', label: 'Reviewer check', detail: 'A reviewer compares the model with your written condition record.', state: 'current' },
    { id: 'qc_publish', label: 'Published to the listing', detail: 'The 3D view appears on the listing once review finishes.', state: 'waiting' },
  ],
};

export function captureJobFor(id: string | null): CaptureJob {
  if (id !== CAPTURE_JOB.listingId) {
    return { ...CAPTURE_JOB, listingId: id ?? CAPTURE_JOB.listingId };
  }
  return CAPTURE_JOB;
}
