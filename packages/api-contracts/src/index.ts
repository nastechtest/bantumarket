/**
 * Wire contracts shared by every frontend and by `check:payload`.
 *
 * There is no OpenAPI source yet (the PHP build has no HTTP layer), so these are maintained by
 * hand and are the authority for shape. When an OpenAPI generator lands, this file is replaced by
 * generated types and the hand-maintained surface shrinks to the budget constants below.
 */

export type Cents = number & { readonly __brand: 'Cents' };

/**
 * The only sanctioned way to make a `Money` from an unbranded number. Branding exists because the
 * ledger's whole argument is that cents and rand never mix in one variable; a constructor you have
 * to call on purpose keeps that argument at the boundary instead of littering `as Cents` casts
 * through every fixture.
 */
export function money(cents: number, currency: 'ZAR' = 'ZAR'): Money {
  if (!Number.isInteger(cents)) throw new TypeError(`Money must be whole cents, got ${cents}`);
  return { cents: cents as Cents, currency };
}

export interface Money {
  readonly cents: Cents;
  readonly currency: 'ZAR';
}

export type VerificationTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

/** spec §12.6 vocabulary. Public surfaces render these strings and no others. */
export const TIER_LABELS: Readonly<Record<VerificationTier, string>> = {
  T1: 'Seller stated',
  T2: 'ID checked',
  T3: 'Listing reviewed',
  T4: 'Item inspected',
  T5: 'Held in escrow',
};

export type RenditionKind = 'MODEL' | 'SPRITE' | 'POSTER' | 'MACRO' | 'THUMBNAIL';

/** Coarse-to-fine geometry tiers. A manifest lists one entry per available tier. */
export type LodTier = 'lod0' | 'lod1' | 'lod2' | 'poster';

export interface Rendition {
  readonly id: string;
  readonly kind: RenditionKind;
  readonly lod: LodTier;
  readonly bytes: number;
  readonly sha256: string;
  readonly bucketKey: string;
  readonly mime: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly frames?: number;
}

/**
 * What the model evidences. Machine-readable because a render implies assurance by accident:
 * a rotating watch looks like "serviced and genuine" and is neither. 07 §6.2.
 */
export type ClaimScope = 'geometry_and_external_condition' | 'condition_only' | 'none';

export const CLAIM_SCOPE_DISCLOSURE: Readonly<Record<ClaimScope, string>> = {
  geometry_and_external_condition:
    'Shown from photographs of this item. Shows outer condition and shape only — not how it works, not its authenticity, and not whether it is water-resistant.',
  condition_only: 'Shown from photographs of this item. Outer condition only.',
  none: 'This model is decorative. It evidences nothing about the item.',
};

export interface AssetManifest {
  readonly assetId: string;
  readonly listingId: string;
  readonly version: number;
  readonly checksum: string;
  readonly claimScope: ClaimScope;
  readonly metricScaleMetersPerUnit: number;
  readonly renditions: readonly Rendition[];
  readonly poster: Rendition;
  readonly sprite?: Rendition;
  readonly captions: readonly ConditionCaption[];
}

export interface ConditionCaption {
  readonly hotspotId: string;
  /** Position in unit space, from the capture's metric alignment. */
  readonly position: readonly [number, number, number];
  readonly disclosureText: string;
  readonly severity: 'cosmetic' | 'functional' | 'unknown';
  /** The disclosure record the dispute process reads. The overlay is a pointer, not the evidence. */
  readonly disclosureId: string;
}

export type CaptureJobState =
  | 'intake'
  | 'captured'
  | 'processed'
  | 'qc_auto'
  | 'qc_human'
  | 'published'
  | 'failed'
  | 'reshot';

/**
 * The order ladder as the PHP ledger writes it. The wire is a string enum, so the contract is a
 * union of string literals; `IN_DISPUTE` is a real state, not an overlay on `PAID`.
 */
export type OrderState =
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'HANDOVER_SCHEDULED'
  | 'HANDOVER_CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'IN_DISPUTE';

export const ORDER_STATES: readonly OrderState[] = [
  'AWAITING_PAYMENT',
  'PAID',
  'HANDOVER_SCHEDULED',
  'HANDOVER_CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'IN_DISPUTE',
];

/** The frame governor's ladder. Vocabulary, so a first-paint analytics module can name a rung. */
export type GovernorLevel = 'full' | 'dpr' | 'pixel' | 'lod' | 'stopped';

/**
 * What the scene runtime reports about one inspection, when it has something to report. Every
 * timing is nullable: an unmeasured field is `null`, never zero, so a gate fails honestly.
 */
export interface SceneTelemetrySnapshot {
  readonly firstPaintMs: number | null;
  readonly sceneReadyMs: number | null;
  readonly governorLevel: GovernorLevel | null;
  readonly lodTier: LodTier | null;
  readonly bytesFetched: number;
  readonly contextLost: boolean;
}

export interface ListingSummary {
  readonly id: string;
  readonly title: string;
  readonly price: Money;
  readonly categorySlug: string;
  readonly sellerTier: VerificationTier;
  readonly has3d: boolean;
  readonly posterUrl: string;
}

/**
 * Payload ceilings, single source of truth (07 §4.2). These are TARGETS until measured; the
 * measurement lands in docs/adr/0003-payload-measurement.md and gate D3 reads that file.
 *
 * `firstPaint*` budgets are inherited unchanged from spec §13.4 and are NOT relaxed by the 3D
 * programme. `scene*` budgets belong to the separate "3D inspection" route class.
 */
export const budgets = {
  firstPaintJsKb: 170,
  homeJsKb: 220,
  sceneExtraJsKb: 400,
  sceneAssetMb: 2.5,
  /** Guard used by loading/byte-budget: refuse the fetch before it starts, not after it lands. */
  sceneLodMaxBytes: 2.5 * 1024 * 1024,
} as const;

export type BudgetName = keyof typeof budgets;
