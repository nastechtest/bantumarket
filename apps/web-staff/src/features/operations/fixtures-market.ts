import type { Tone } from './ui.js';

/** Realistic South African marketplace fixtures for the review, capture and catalogue screens. */

export interface QueueRow {
  readonly id: string;
  readonly title: string;
  readonly seller: string;
  readonly priceCents: number;
  readonly submittedAt: string;
  readonly flags: readonly string[];
  readonly sla: string;
  readonly slaTone: Tone;
}

export const QUEUE_ROWS: readonly QueueRow[] = [
  {
    id: 'lst_2026_0481',
    title: '1994 Seiko SKX007 diver, full set',
    seller: '@thandos_attic',
    priceCents: 485_000,
    submittedAt: '2026-10-22T07:40:00.000Z',
    flags: ['Price above category median'],
    sla: '18h left',
    slaTone: 'neutral',
  },
  {
    id: 'lst_2026_0479',
    title: "Levi's 501 made-in-USA denim, W32",
    seller: '@capevintage_co',
    priceCents: 125_000,
    submittedAt: '2026-10-22T06:55:00.000Z',
    flags: [],
    sla: '19h left',
    slaTone: 'neutral',
  },
  {
    id: 'lst_2026_0476',
    title: 'Nintendo Game Boy DMG-01 with four cartridges',
    seller: '@pixeljunk_jhb',
    priceCents: 240_000,
    submittedAt: '2026-10-22T05:10:00.000Z',
    flags: ['Photos reuse a stock image'],
    sla: '6h overdue',
    slaTone: 'negative',
  },
  {
    id: 'lst_2026_0472',
    title: 'Hand-knotted Persian rug, 2.1 × 1.4 m',
    seller: '@karoo_house',
    priceCents: 1_200_000,
    submittedAt: '2026-10-21T15:20:00.000Z',
    flags: ['Model claim needs review'],
    sla: '18h overdue',
    slaTone: 'negative',
  },
  {
    id: 'lst_2026_0469',
    title: 'Canon AE-1 Program with 50mm f/1.8',
    seller: '@film_supply_ct',
    priceCents: 310_000,
    submittedAt: '2026-10-21T11:05:00.000Z',
    flags: [],
    sla: '23h overdue',
    slaTone: 'negative',
  },
  {
    id: 'lst_2026_0464',
    title: 'Doc Martens 1460, UK 7, worn twice',
    seller: '@sneaker_swap_sa',
    priceCents: 145_000,
    submittedAt: '2026-10-21T08:30:00.000Z',
    flags: ['Size chart missing'],
    sla: '2h left',
    slaTone: 'caution',
  },
  {
    id: 'lst_2026_0460',
    title: 'Mid-century teak sideboard',
    seller: '@jozi_finds',
    priceCents: 680_000,
    submittedAt: '2026-10-20T16:45:00.000Z',
    flags: ['Seller account under 30 days'],
    sla: '8h overdue',
    slaTone: 'caution',
  },
  {
    id: 'lst_2026_0455',
    title: 'Sony Walkman WM-EX194, serviced',
    seller: '@analogue_annex',
    priceCents: 98_000,
    submittedAt: '2026-10-20T09:15:00.000Z',
    flags: [],
    sla: '16h overdue',
    slaTone: 'negative',
  },
];

export interface PolicyCheck {
  readonly id: string;
  readonly label: string;
  readonly result: 'pass' | 'warn' | 'fail';
  readonly detail: string;
}

export const LISTING_REVIEW = {
  id: 'lst_2026_0481',
  title: '1994 Seiko SKX007 diver, full set',
  sellerHandle: '@thandos_attic',
  sellerName: 'Thando Mokoena',
  category: 'Watches › Divers',
  condition: 'Used — good',
  priceCents: 485_000,
  submittedAt: '2026-10-22T07:40:00.000Z',
  tier: 'T2 — ID checked',
  location: 'Soweto, Gauteng',
  description:
    'Original 1994 SKX007 with box, papers and two bezels. Bezel insert has faded to a ghost grey. Movement keeps +9 seconds a day on a timegrapher. Serial checked against the case-back stamp.',
  photoCount: 6,
  modelClaim: 'Outer condition only — a model cannot evidence authenticity or movement health.',
  seller: {
    sales: 41,
    rating: '4.8 / 5',
    memberSince: 'March 2024',
    previousReviews: 12,
    takedowns: 0,
    disputeRate: '1.2%',
  },
  checks: [
    { id: 'title', label: 'Title and description policy', result: 'pass', detail: 'No contact details, no prohibited claims.' },
    { id: 'price', label: 'Price against category median', result: 'warn', detail: 'R4,850 is 12% above the R4,330 median for a complete SKX007.' },
    { id: 'images', label: 'Image originality', result: 'pass', detail: 'Six photos match the seller’s camera roll; no reverse-image hits.' },
    { id: 'category', label: 'Category fit', result: 'pass', detail: 'Diver watch attributes are complete, including case diameter and movement.' },
    { id: 'model', label: 'Model claim scope', result: 'warn', detail: 'Rendition discloses outer condition only; the listing copy must not claim authenticity.' },
  ] satisfies readonly PolicyCheck[],
};

export interface CaptureJob {
  readonly id: string;
  readonly listingId: string;
  readonly title: string;
  readonly seller: string;
  readonly city: string;
  readonly studio: string;
  readonly scheduledFor: string;
  readonly operator: string;
  readonly status: 'Booked' | 'In progress' | 'Failed' | 'QC pending';
  readonly note: string;
}

export const CAPTURE_JOBS: readonly CaptureJob[] = [
  {
    id: 'cap_2026_0918',
    listingId: 'lst_2026_0481',
    title: '1994 Seiko SKX007 diver',
    seller: '@thandos_attic',
    city: 'Johannesburg',
    studio: 'Braamfontein studio',
    scheduledFor: '2026-10-23T14:00:00.000Z',
    operator: 'Ayanda Ndlovu',
    status: 'Booked',
    note: 'Two bezels to capture; bring the macro rail.',
  },
  {
    id: 'cap_2026_0912',
    listingId: 'lst_2026_0472',
    title: 'Hand-knotted Persian rug',
    seller: '@karoo_house',
    city: 'Cape Town',
    studio: 'Woodstock studio',
    scheduledFor: '2026-10-23T10:30:00.000Z',
    operator: 'Ruan de Klerk',
    status: 'In progress',
    note: 'Floor rig booked for the full morning.',
  },
  {
    id: 'cap_2026_0907',
    listingId: 'lst_2026_0460',
    title: 'Mid-century teak sideboard',
    seller: '@jozi_finds',
    city: 'Johannesburg',
    studio: 'Braamfontein studio',
    scheduledFor: '2026-10-24T09:00:00.000Z',
    operator: 'Ayanda Ndlovu',
    status: 'Booked',
    note: 'Needs the wide bay; item is 1.8 m across.',
  },
  {
    id: 'cap_2026_0901',
    listingId: 'lst_2026_0448',
    title: 'Rolex Datejust 1601, 1972',
    seller: '@sandton_time',
    city: 'Pretoria',
    studio: 'Hatfield studio',
    scheduledFor: '2026-10-22T08:00:00.000Z',
    operator: 'Nomsa Nkosi',
    status: 'Failed',
    note: 'Lens calibration failed at intake; rebooked for 24 October.',
  },
  {
    id: 'cap_2026_0896',
    listingId: 'lst_2026_0441',
    title: 'Cartier Santos Dumont, small model',
    seller: '@rosebank_luxe',
    city: 'Durban',
    studio: 'Umhlanga studio',
    scheduledFor: '2026-10-24T13:00:00.000Z',
    operator: 'Ruan de Klerk',
    status: 'Booked',
    note: 'High-value intake; two-person rule applies.',
  },
  {
    id: 'cap_2026_0890',
    listingId: 'lst_2026_0437',
    title: 'Victorian mahogany writing desk',
    seller: '@old_cape_house',
    city: 'Cape Town',
    studio: 'Woodstock studio',
    scheduledFor: '2026-10-22T11:30:00.000Z',
    operator: 'Nomsa Nkosi',
    status: 'QC pending',
    note: 'Renditions uploaded; waiting for a QC reviewer.',
  },
];

export interface CaptureCapacity {
  readonly city: string;
  readonly studio: string;
  readonly slots: number;
  readonly booked: number;
  readonly operators: number;
  readonly turnaround: string;
}

export const CAPTURE_CAPACITY: readonly CaptureCapacity[] = [
  { city: 'Johannesburg', studio: 'Braamfontein', slots: 18, booked: 14, operators: 3, turnaround: '1.8 days' },
  { city: 'Cape Town', studio: 'Woodstock', slots: 14, booked: 12, operators: 2, turnaround: '2.4 days' },
  { city: 'Durban', studio: 'Umhlanga', slots: 8, booked: 4, operators: 1, turnaround: '3.1 days' },
  { city: 'Pretoria', studio: 'Hatfield', slots: 10, booked: 6, operators: 1, turnaround: '2.0 days' },
  { city: 'Port Elizabeth', studio: 'Walmer', slots: 6, booked: 1, operators: 1, turnaround: '4.5 days' },
];

export interface RenditionRow {
  readonly kind: string;
  readonly lod: string;
  readonly bytes: number;
  readonly hash: string;
}

export interface QcCheck {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export const CAPTURE_QC = {
  jobId: 'cap_2026_0918',
  listingId: 'lst_2026_0481',
  title: '1994 Seiko SKX007 diver, full set',
  seller: '@thandos_attic',
  operator: 'Ayanda Ndlovu',
  capturedAt: '2026-10-23T14:42:00.000Z',
  claimScope: 'Outer condition only. The rendition is not evidence of authenticity or water resistance.',
  renditions: [
    { kind: 'MODEL', lod: 'lod0', bytes: 1_884_160, hash: '9f2c41a8' },
    { kind: 'SPRITE', lod: 'lod2', bytes: 245_760, hash: 'b7710c3e' },
    { kind: 'POSTER', lod: 'poster', bytes: 98_304, hash: '4e0a99d1' },
    { kind: 'MACRO', lod: 'lod1', bytes: 634_880, hash: 'a13f5e27' },
    { kind: 'THUMBNAIL', lod: 'poster', bytes: 18_432, hash: 'c8d2104b' },
  ] satisfies readonly RenditionRow[],
  checks: [
    { id: 'angles', label: 'All six angles captured', detail: 'Front, back, left, right, top and a 45° hero.' },
    { id: 'scale', label: 'Scale marker visible in every frame', detail: 'The 50 mm marker is in frame and legible.' },
    { id: 'colour', label: 'Colour card and white balance', detail: 'Card reads within tolerance on all six frames.' },
    { id: 'disclosure', label: 'Claim-scope disclosure attached', detail: 'Copy says outer condition only and names what the model cannot evidence.' },
    { id: 'reflections', label: 'No studio reflections or operator visible', detail: 'Checked the crystal and both bezel faces.' },
  ] satisfies readonly QcCheck[],
};

export interface CategoryRow {
  readonly id: string;
  readonly path: string;
  readonly slug: string;
  readonly listings: number;
  readonly attributes: readonly string[];
  readonly status: 'Active' | 'Draft' | 'Deprecated';
  readonly owner: string;
}

export const CATEGORY_ROWS: readonly CategoryRow[] = [
  { id: 'cat_watches_divers', path: 'Watches › Divers', slug: 'watches-divers', listings: 1_284, attributes: ['case_diameter_mm', 'movement', 'water_resistance_m'], status: 'Active', owner: 'Catalogue' },
  { id: 'cat_watches_dress', path: 'Watches › Dress', slug: 'watches-dress', listings: 946, attributes: ['case_diameter_mm', 'movement'], status: 'Active', owner: 'Catalogue' },
  { id: 'cat_watches_sports', path: 'Watches › Sports', slug: 'watches-sports', listings: 312, attributes: ['case_diameter_mm', 'movement', 'water_resistance_m'], status: 'Draft', owner: 'Catalogue' },
  { id: 'cat_cameras_film', path: 'Cameras › Film SLR', slug: 'cameras-film-slr', listings: 512, attributes: ['mount', 'shutter_tested', 'film_format'], status: 'Active', owner: 'Catalogue' },
  { id: 'cat_audio_cassette', path: 'Audio › Portable cassette', slug: 'audio-cassette', listings: 388, attributes: ['mechanism_tested', 'belt_replaced'], status: 'Active', owner: 'Catalogue' },
  { id: 'cat_furniture_sideboards', path: 'Furniture › Sideboards', slug: 'furniture-sideboards', listings: 271, attributes: ['width_mm', 'material', 'restoration_notes'], status: 'Active', owner: 'Catalogue' },
  { id: 'cat_rugs_handknotted', path: 'Rugs › Hand-knotted', slug: 'rugs-hand-knotted', listings: 164, attributes: ['length_mm', 'width_mm', 'origin'], status: 'Active', owner: 'Catalogue' },
  { id: 'cat_footwear_boots', path: 'Footwear › Boots', slug: 'footwear-boots', listings: 803, attributes: ['uk_size', 'sole_condition'], status: 'Active', owner: 'Catalogue' },
  { id: 'cat_denim_jeans', path: 'Denim › Jeans', slug: 'denim-jeans', listings: 1_107, attributes: ['waist_inches', 'inseam_inches', 'selvedge'], status: 'Draft', owner: 'Catalogue' },
];

export interface TaxonomyChange {
  readonly id: string;
  readonly kind: 'Merge' | 'Attribute' | 'Retire';
  readonly summary: string;
  readonly requestedBy: string;
  readonly age: string;
}

export const TAXONOMY_CHANGES: readonly TaxonomyChange[] = [
  { id: 'chg_2026_441', kind: 'Merge', summary: 'Merge “Watches › Sports” into “Watches › Divers”', requestedBy: 'Naledi Khumalo', age: '2 days' },
  { id: 'chg_2026_438', kind: 'Attribute', summary: 'Add lug_width_mm to Watches › Divers', requestedBy: 'Thandi Mokoena', age: '4 days' },
  { id: 'chg_2026_435', kind: 'Retire', summary: 'Retire “Audio › Minidisc” after stock clears', requestedBy: 'Sipho Dlamini', age: '6 days' },
];
