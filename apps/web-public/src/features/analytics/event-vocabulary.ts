/**
 * The value vocabularies behind the event catalogue — the closed sets a prop may take.
 *
 * This is the half of the catalogue that has no event names in it. Split from `event-catalogue.ts`
 * because the two change for different reasons: a new enum here is a new *kind of value* that can be
 * sent (a POPIA review event, and `no-pii.test.ts` walks every one of them), while a new entry there
 * is a new *question the measurement plan asks*. Keeping them apart also means the vocabularies can be
 * read as data by the schema and PII tests without pulling the whole EVENTS table into the import.
 *
 * Rule of the file: every vocabulary is a closed set, and the reason a set exists is stated beside it.
 * Nothing here may be an open `string` — an open string is where a listing title or a phone number
 * would eventually arrive.
 */
import type { CaptureJobState, LodTier, OrderState, VerificationTier } from '@nastech/api-contracts';
import { ORDER_STATES as ORDER_STATES_CONTRACT, TIER_LABELS } from '@nastech/api-contracts';

/* ------------------------------------------------------------------ prop kinds */

/**
 * The complete vocabulary of value types. Adding a kind to this list is a review event: a new kind
 * is a new thing that can be sent, and `no-pii.test.ts` walks it.
 */
export type PropSpec =
  /** Controlled vocabulary. Values may not contain a space (asserted in the tests). */
  | { readonly kind: 'enum'; readonly values: readonly string[]; readonly nullable?: boolean }
  /** A lowercase slug from the catalogue, e.g. `pre-owned-watches`. No spaces, no digits runs. */
  | { readonly kind: 'slug'; readonly maxLength: number }
  /**
   * A session-scoped correlation ref produced by `session.ts#refFor` — a truncated HMAC under a
   * salt that dies with the session. Never a raw id: a raw id is a permanent join key.
   */
  | { readonly kind: 'ref'; readonly length: number }
  | { readonly kind: 'boolean' }
  /** A count of things. Unit is required so no numeric prop can secretly be money. */
  | { readonly kind: 'count'; readonly unit: 'count'; readonly max: number }
  /** Duration in milliseconds, from a monotonic clock where possible. */
  | { readonly kind: 'count'; readonly unit: 'ms'; readonly max: number; readonly nullable?: boolean }
  /** Bytes fetched / requested. Never a checksum, never a key. */
  | { readonly kind: 'count'; readonly unit: 'bytes'; readonly max: number }
  /** A ratio like CLS, which has no unit and no PII in it by construction. */
  | { readonly kind: 'ratio'; readonly max: number };

export type PropKeyOf<S extends PropSpec> = S extends { kind: 'ref' } ? string : S extends { kind: 'enum' } ? string : string | number | boolean;

/* ------------------------------------------------------------------ vocabularies */

/** `RouteClass` in `router.tsx` is controller-owned; mirrored here as data. // CONTRACT-GAP: promote to a shared type module. */
export const ROUTE_CLASSES = ['brand', 'first-paint', 'scene', 'critical'] as const;
export type RouteClassMirror = (typeof ROUTE_CLASSES)[number];

/**
 * The order ladder is the ledger's, imported from the contract rather than re-declared. The
 * aliases keep this module's existing public names for its own callers.
 */
export const ORDER_STATES = ORDER_STATES_CONTRACT;
export type OrderStateMirror = OrderState;

/** Mirrors `ui-3d`'s `GlSupport` without importing the scene package into a first-paint chunk. // CONTRACT-GAP. */
export const GL_SUPPORT = ['webgl2', 'webgl1', 'none'] as const;

/** Mirrors `ui-3d`'s `GovernorLevel`. // CONTRACT-GAP: export it from `@nastech/ui-3d/quality` as a type the app can import. */
export const GOVERNOR_LEVELS = ['full', 'dpr', 'pixel', 'lod', 'stopped'] as const;

/** `LodTier` and `CaptureJobState` do come from api-contracts, so the vocabularies are derived, not typed twice. */
export const LOD_TIERS: readonly LodTier[] = ['lod0', 'lod1', 'lod2', 'poster'];
export const CAPTURE_STATES: readonly CaptureJobState[] = [
  'intake',
  'captured',
  'processed',
  'qc_auto',
  'qc_human',
  'published',
  'failed',
  'reshot',
];
/** Tier *codes*, read off the label registry so the labels themselves are never re-declared here. */
export const TIER_CODES: readonly VerificationTier[] = Object.keys(TIER_LABELS) as VerificationTier[];

/** Compile-time proof that the two locally-declared vocabularies still match their contract types. */
type Exactly<A extends readonly string[], B extends string> = A[number] extends B ? (B extends A[number] ? true : never) : never;
const _lodTiersMatch: Exactly<typeof LOD_TIERS, LodTier> = true;
const _captureStatesMatch: Exactly<typeof CAPTURE_STATES, CaptureJobState> = true;
export const _contractChecks = [_lodTiersMatch, _captureStatesMatch];

export const RESULT_COUNT_BUCKETS = ['0', '1_5', '6_20', '21_100', 'over_100'] as const;
export const LEAD_TIME_BUCKETS = ['same_day', '1_2_days', '3_7_days', 'over_7_days'] as const;
export const TIME_TO_LIVE_BUCKETS = ['under_1h', '1_24h', '1_7d', 'over_7d'] as const;
export const SESSION_AGE_BUCKETS = ['under_15m', '15_60m', '1_8h', 'over_8h'] as const;

/** Why a buyer landed on the static path. Every value here is a R270 data point. */
export const STATIC_FALLBACK_REASONS = [
  'no_gl',
  'budget_refused',
  'reduced_motion',
  'save_data',
  'scene_crash',
  'context_lost',
  'manifest_missing',
  'no_rendition',
  'user_chose_static',
  'no_3d_build',
] as const;

export const BUDGET_REFUSAL_VERDICTS = ['over_budget', 'no_rendition_fits', 'manifest_absent'] as const;

/** `dispute_raised` carries a code, never a story. The story belongs in the dispute record, which the ledger reads. */
export const DISPUTE_REASONS = [
  'not_as_described',
  'condition_worse_than_disclosed',
  'not_the_item',
  'not_working',
  'damaged_in_transit',
  'not_received',
  'counterfeit_concern',
  'other_code_only',
] as const;

export const SEARCH_SORTS = ['relevance', 'recent', 'price_asc', 'price_desc', 'tier'] as const;
export const VIEW_ENTRIES = ['home', 'search', 'item_page', 'direct_link', 'share_link', 'category'] as const;

/** The consent outcomes we may lawfully record, mirroring `lib/consent`'s methods. */
export const CONSENT_OUTCOMES = ['granted', 'refused', 'withdrawn'] as const;
export const SESSION_ROTATION_REASONS = [
  'first_visit',
  'consent_change',
  'withdrawal',
  'idle_expired',
  'max_age',
  'entropy_unavailable',
] as const;
