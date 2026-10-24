/**
 * The event catalogue itself: one entry per question the measurement plan asks, with the props it may
 * carry. `EventPropsMap` gives the compiler the shape and `EVENTS` gives the runtime the same shape as
 * data, so the two cannot drift — `EVENTS` is annotated as a mapped type over `EventPropsMap`, which
 * makes a prop without a spec, or a `required` entry that is not a prop, a compile error.
 *
 * The vocabularies the props point at live in `event-vocabulary.ts`; this file names events, not
 * value sets. The reason for each entry is load-bearing: an event that answers no exit test in 04, or
 * no R270 question, is a POPIA s14(1) collection with no purpose and does not belong here.
 */
import type { CaptureJobState, LodTier, Money, VerificationTier } from '@nastech/api-contracts';
import type { ConsentCategory } from '../../lib/consent/types.js';
import { bucketPrice, PRICE_BUCKETS } from './pii-guards.js';
import {
  BUDGET_REFUSAL_VERDICTS,
  CAPTURE_STATES,
  CONSENT_OUTCOMES,
  DISPUTE_REASONS,
  GL_SUPPORT,
  GOVERNOR_LEVELS,
  LEAD_TIME_BUCKETS,
  LOD_TIERS,
  ORDER_STATES,
  RESULT_COUNT_BUCKETS,
  ROUTE_CLASSES,
  SEARCH_SORTS,
  SESSION_AGE_BUCKETS,
  SESSION_ROTATION_REASONS,
  STATIC_FALLBACK_REASONS,
  TIER_CODES,
  TIME_TO_LIVE_BUCKETS,
  VIEW_ENTRIES,
} from './event-vocabulary.js';
import type { OrderStateMirror, PropSpec, RouteClassMirror } from './event-vocabulary.js';

/* ------------------------------------------------------------------ props per event */

export interface EventPropsMap {
  /* --- essential: the legal record and the proof that the id rotates. Not behavioural data. --- */
  consent_recorded: {
    readonly category: 'quality' | 'measurement' | 'marketing';
    readonly outcome: (typeof CONSENT_OUTCOMES)[number];
    readonly notice_version: string;
  };
  session_rotated: {
    readonly reason: (typeof SESSION_ROTATION_REASONS)[number];
    readonly session_age_bucket: (typeof SESSION_AGE_BUCKETS)[number];
  };

  /* --- measurement: the four funnels. --- */
  page_view: {
    readonly route_pattern: string;
    readonly route_class: RouteClassMirror;
  };
  search_performed: {
    readonly result_count_bucket: (typeof RESULT_COUNT_BUCKETS)[number];
    readonly has_results: boolean;
    readonly request_failed: boolean;
    readonly category_slug?: string;
    readonly filter_count?: number;
    readonly sort?: (typeof SEARCH_SORTS)[number];
    readonly page?: number;
  };
  listing_viewed: {
    readonly listing_ref: string;
    readonly has3d: boolean;
    readonly poster_available: boolean;
    readonly entry?: (typeof VIEW_ENTRIES)[number];
    readonly price_bucket?: (typeof PRICE_BUCKETS)[number];
    readonly category_slug?: string;
    readonly seller_tier?: VerificationTier;
  };
  inspect_opened: {
    readonly listing_ref: string;
    readonly entry: (typeof VIEW_ENTRIES)[number];
    readonly gl_capability?: (typeof GL_SUPPORT)[number];
  };
  checkout_started: {
    readonly order_ref: string;
    readonly price_bucket: (typeof PRICE_BUCKETS)[number];
    readonly listing_ref?: string;
    readonly had_3d_inspection?: boolean;
  };
  payment_confirmed: {
    readonly order_ref: string;
    readonly from_state: OrderStateMirror;
    readonly to_state: OrderStateMirror;
    readonly amount_bucket: (typeof PRICE_BUCKETS)[number];
    readonly had_3d_inspection?: boolean;
  };
  handover_scheduled: {
    readonly order_ref: string;
    readonly lead_time_bucket: (typeof LEAD_TIME_BUCKETS)[number];
    readonly point_type?: 'pickup_point' | 'courier';
  };
  handover_confirmed: {
    readonly order_ref: string;
    readonly pin_ok: boolean;
    readonly same_day?: boolean;
  };
  dispute_raised: {
    readonly order_ref: string;
    readonly reason_code: (typeof DISPUTE_REASONS)[number];
    readonly order_state: OrderStateMirror;
    readonly had_3d_inspection?: boolean;
  };

  /* --- measurement, seller side: 04's time-to-first-listing and listing→live. --- */
  seller_onboarded: {
    readonly outcome: 'completed' | 'abandoned' | 'failed';
    readonly tier?: VerificationTier;
  };
  listing_draft_started: {
    readonly listing_ref: string;
    readonly category_slug: string;
  };
  listing_created: {
    readonly listing_ref: string;
    readonly category_slug: string;
    readonly price_bucket: (typeof PRICE_BUCKETS)[number];
    readonly static_path_only?: boolean;
  };
  listing_submitted: {
    readonly listing_ref: string;
    readonly price_bucket: (typeof PRICE_BUCKETS)[number];
    readonly capture_requested?: boolean;
  };
  listing_published: {
    readonly listing_ref: string;
    readonly price_bucket: (typeof PRICE_BUCKETS)[number];
    readonly time_to_live_bucket: (typeof TIME_TO_LIVE_BUCKETS)[number];
    readonly capture_state?: CaptureJobState;
  };

  /* --- quality: can the app be used, and was 3D even available. --- */
  inspect_static_fallback_shown: {
    readonly listing_ref: string;
    readonly reason: (typeof STATIC_FALLBACK_REASONS)[number];
    /** True only when poster + turntable + written disclosures all rendered. The brief's "sufficient, not inferior" claim, as a number. */
    readonly static_path_complete: boolean;
    readonly had_poster?: boolean;
    readonly had_turntable?: boolean;
    readonly had_disclosures?: boolean;
    readonly turntable_frames?: number;
  };
  scene_budget_refused: {
    readonly listing_ref: string;
    readonly requested_bytes: number;
    readonly verdict: (typeof BUDGET_REFUSAL_VERDICTS)[number];
    readonly lod_tier: LodTier;
    readonly rendition_count?: number;
  };
  scene_telemetry: {
    readonly listing_ref: string;
    /** `null` means "never recorded", which is a real answer; `0` would be a lie. See `quality-signals.ts`. */
    readonly first_paint_ms: number | null;
    readonly scene_ready_ms: number | null;
    readonly governor_level: (typeof GOVERNOR_LEVELS)[number] | null;
    readonly lod_tier: LodTier | null;
    readonly bytes_fetched: number;
    readonly context_lost: boolean;
  };
  scene_context_lost: {
    readonly listing_ref: string;
    readonly recovered_via_static: boolean;
  };
  vital_recorded: {
    readonly metric: 'lcp' | 'cls' | 'inp' | 'ttfb' | 'fcp';
    readonly rating: 'good' | 'needs_improvement' | 'poor';
    readonly route_class?: RouteClassMirror;
    readonly value_ms?: number;
    readonly value_ratio?: number;
  };
}

export type EventName = keyof EventPropsMap;

/** Every event the brief names, present and spelled exactly. */
export const REQUIRED_EVENT_NAMES: readonly EventName[] = [
  'search_performed',
  'listing_viewed',
  'inspect_opened',
  'inspect_static_fallback_shown',
  'scene_budget_refused',
  'checkout_started',
  'payment_confirmed',
  'handover_scheduled',
  'handover_confirmed',
  'dispute_raised',
];

/* ------------------------------------------------------------------ definitions */

export interface EventDefinition<E extends EventName> {
  readonly name: E;
  readonly category: ConsentCategory;
  /** The question this row answers, in one line. If it cannot be written, the event should not exist. */
  readonly purpose: string;
  readonly props: { readonly [K in keyof EventPropsMap[E]]-?: PropSpec };
  readonly required: readonly (keyof EventPropsMap[E] & string)[];
  readonly optional: readonly (keyof EventPropsMap[E] & string)[];
  /**
   * Names this event specifically must never carry, on top of the global list. Documentation that a
   * test enforces: `listing_viewed` is the one event where a title and an exact price are within
   * arm's reach of the call site, so saying "not here" in prose is not enough.
   */
  readonly forbidden: readonly string[];
}

const REF_LENGTH = 24;

export const EVENTS: { readonly [K in EventName]: EventDefinition<K> } = {
  consent_recorded: {
    name: 'consent_recorded',
    category: 'essential',
    purpose: 'the permission in force when a row was written — and the denominator that tells us how biased the consented cohort is',
    props: {
      category: { kind: 'enum', values: ['quality', 'measurement', 'marketing'] },
      outcome: { kind: 'enum', values: CONSENT_OUTCOMES },
      notice_version: { kind: 'slug', maxLength: 48 },
    },
    required: ['category', 'outcome', 'notice_version'],
    optional: [],
    forbidden: ['method', 'device_id', 'record_json'],
  },
  session_rotated: {
    name: 'session_rotated',
    category: 'essential',
    purpose: 'proves the rotating id actually rotates; deliberately carries no id and no device data, so this event cannot become the tracking mechanism it is measuring the absence of',
    props: {
      reason: { kind: 'enum', values: SESSION_ROTATION_REASONS },
      session_age_bucket: { kind: 'enum', values: SESSION_AGE_BUCKETS },
    },
    required: ['reason', 'session_age_bucket'],
    optional: [],
    forbidden: ['session_id', 'previous_session_id', 'device_id', 'storage_key'],
  },

  page_view: {
    name: 'page_view',
    category: 'measurement',
    purpose: 'which route class a buyer reached, so funnel drop-off can be attributed to a screen rather than to a guess',
    props: {
      route_pattern: { kind: 'slug', maxLength: 64 },
      route_class: { kind: 'enum', values: ROUTE_CLASSES },
    },
    required: ['route_pattern', 'route_class'],
    optional: [],
    // The *pattern* (`/item/:id`), never the resolved path: `/item/lst_42` is an id in a string.
    forbidden: ['path', 'url', 'resolved_path', 'query', 'search', 'hash'],
  },
  search_performed: {
    name: 'search_performed',
    category: 'measurement',
    purpose: 'does search return anything, and does a zero result mean "nothing matches" or "the index was down" — 04 reads the first as supply signal',
    props: {
      result_count_bucket: { kind: 'enum', values: RESULT_COUNT_BUCKETS },
      has_results: { kind: 'boolean' },
      request_failed: { kind: 'boolean' },
      category_slug: { kind: 'slug', maxLength: 48 },
      filter_count: { kind: 'count', unit: 'count', max: 12 },
      sort: { kind: 'enum', values: SEARCH_SORTS },
      page: { kind: 'count', unit: 'count', max: 1000 },
    },
    required: ['result_count_bucket', 'has_results', 'request_failed'],
    optional: ['category_slug', 'filter_count', 'sort', 'page'],
    // The query string is the single most valuable thing a marketplace could collect about a buyer
    // and the single most identifying: "Rolex 126613 nobody else in Sandton searched for" is a
    // person. We take the count, the bucket and the failure, and none of the words.
    forbidden: ['query', 'q', 'search_term', 'text', 'suggest_text', 'autocomplete', 'filters', 'brand'],
  },
  listing_viewed: {
    name: 'listing_viewed',
    category: 'measurement',
    purpose: 'first step of inspection→purchase; also the denominator for how often a 3D-bearing item is seen at all',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      has3d: { kind: 'boolean' },
      poster_available: { kind: 'boolean' },
      entry: { kind: 'enum', values: VIEW_ENTRIES },
      price_bucket: { kind: 'enum', values: PRICE_BUCKETS },
      category_slug: { kind: 'slug', maxLength: 48 },
      seller_tier: { kind: 'enum', values: TIER_CODES },
    },
    required: ['listing_ref', 'has3d', 'poster_available'],
    optional: ['entry', 'price_bucket', 'category_slug', 'seller_tier'],
    forbidden: ['title', 'price', 'price_cents', 'seller_id', 'seller_name', 'listing_id', 'description'],
  },
  inspect_opened: {
    name: 'inspect_opened',
    category: 'measurement',
    purpose: 'the buyer chose to look closer — step two of inspection→purchase and the denominator of the 3D availability rate',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      entry: { kind: 'enum', values: VIEW_ENTRIES },
      gl_capability: { kind: 'enum', values: GL_SUPPORT },
    },
    required: ['listing_ref', 'entry'],
    optional: ['gl_capability'],
    forbidden: ['title', 'listing_id', 'asset_id', 'bucket_key', 'signed_url'],
  },
  checkout_started: {
    name: 'checkout_started',
    category: 'measurement',
    purpose: 'intent to buy, on a critical route — hence bucketed price and a session-scoped order ref and nothing else',
    props: {
      order_ref: { kind: 'ref', length: REF_LENGTH },
      price_bucket: { kind: 'enum', values: PRICE_BUCKETS },
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      had_3d_inspection: { kind: 'boolean' },
    },
    required: ['order_ref', 'price_bucket'],
    optional: ['listing_ref', 'had_3d_inspection'],
    forbidden: ['price', 'price_cents', 'amount', 'card', 'address', 'buyer_id', 'email', 'phone'],
  },
  payment_confirmed: {
    name: 'payment_confirmed',
    category: 'measurement',
    purpose: 'the money actually moved: the last step of inspection→purchase and the only conversion number the pilot should trust',
    props: {
      order_ref: { kind: 'ref', length: REF_LENGTH },
      from_state: { kind: 'enum', values: ORDER_STATES },
      to_state: { kind: 'enum', values: ORDER_STATES },
      amount_bucket: { kind: 'enum', values: PRICE_BUCKETS },
      had_3d_inspection: { kind: 'boolean' },
    },
    required: ['order_ref', 'from_state', 'to_state', 'amount_bucket'],
    optional: ['had_3d_inspection'],
    // A refund is money-bearing at REFUND_SETTLED, not at REFUND_INITIATED: the enum is the ladder,
    // so an event can only claim a state the ledger actually has.
    forbidden: ['amount', 'amount_cents', 'card_last4', 'pan', 'invoice', 'reference'],
  },
  handover_scheduled: {
    name: 'handover_scheduled',
    category: 'measurement',
    purpose: 'did a paid order reach a physical meeting — the pilot is one city, so a lead-time bucket is enough and an address is not',
    props: {
      order_ref: { kind: 'ref', length: REF_LENGTH },
      lead_time_bucket: { kind: 'enum', values: LEAD_TIME_BUCKETS },
      point_type: { kind: 'enum', values: ['pickup_point', 'courier'] },
    },
    required: ['order_ref', 'lead_time_bucket'],
    optional: ['point_type'],
    forbidden: ['address', 'suburb', 'city', 'lat', 'lng', 'slot_time', 'contact_name', 'phone'],
  },
  handover_confirmed: {
    name: 'handover_confirmed',
    category: 'measurement',
    purpose: 'the PIN was exchanged and both sides confirmed — the last step before the ledger can take commission',
    props: {
      order_ref: { kind: 'ref', length: REF_LENGTH },
      pin_ok: { kind: 'boolean' },
      same_day: { kind: 'boolean' },
    },
    required: ['order_ref', 'pin_ok'],
    optional: ['same_day'],
    forbidden: ['pin', 'pin_code', 'address', 'name', 'time'],
  },
  dispute_raised: {
    name: 'dispute_raised',
    category: 'measurement',
    purpose: 'the counter-metric to the 3D programme: if renders changed dispute outcomes, `had_3d_inspection` × `reason_code` is where we would see it',
    props: {
      order_ref: { kind: 'ref', length: REF_LENGTH },
      reason_code: { kind: 'enum', values: DISPUTE_REASONS },
      order_state: { kind: 'enum', values: ORDER_STATES },
      had_3d_inspection: { kind: 'boolean' },
    },
    required: ['order_ref', 'reason_code', 'order_state'],
    optional: ['had_3d_inspection'],
    // The story is evidence and the dispute process reads evidence. It goes in the dispute record
    // with an author and a retention period, not in an analytics row that has neither.
    forbidden: ['description', 'text', 'message', 'story', 'evidence_text', 'claim', 'email', 'phone', 'name'],
  },

  seller_onboarded: {
    name: 'seller_onboarded',
    category: 'measurement',
    purpose: 'the anchor for time-to-first-listing: without it the funnel measures "session to listing" and misses the seller who left and came back',
    props: {
      outcome: { kind: 'enum', values: ['completed', 'abandoned', 'failed'] },
      tier: { kind: 'enum', values: TIER_CODES },
    },
    required: ['outcome'],
    optional: ['tier'],
    forbidden: ['name', 'email', 'phone', 'id_number', 'user_id', 'tier_label'],
  },
  listing_draft_started: {
    name: 'listing_draft_started',
    category: 'measurement',
    purpose: 'first intent to sell; the gap to `listing_created` is where a draft form loses sellers',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      category_slug: { kind: 'slug', maxLength: 48 },
    },
    required: ['listing_ref', 'category_slug'],
    optional: [],
    forbidden: ['title', 'description', 'price', 'price_cents'],
  },
  listing_created: {
    name: 'listing_created',
    category: 'measurement',
    purpose: 'a saved listing exists; the denominator for listing→live conversion',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      category_slug: { kind: 'slug', maxLength: 48 },
      price_bucket: { kind: 'enum', values: PRICE_BUCKETS },
      static_path_only: { kind: 'boolean' },
    },
    required: ['listing_ref', 'category_slug', 'price_bucket'],
    optional: ['static_path_only'],
    forbidden: ['title', 'description', 'price', 'price_cents', 'listing_id'],
  },
  listing_submitted: {
    name: 'listing_submitted',
    category: 'measurement',
    purpose: 'entered the review queue — the step between a seller\'s work and the platform\'s promise',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      price_bucket: { kind: 'enum', values: PRICE_BUCKETS },
      capture_requested: { kind: 'boolean' },
    },
    required: ['listing_ref', 'price_bucket'],
    optional: ['capture_requested'],
    forbidden: ['title', 'price', 'price_cents'],
  },
  listing_published: {
    name: 'listing_published',
    category: 'measurement',
    purpose: 'live, i.e. buyable: the numerator of listing→live conversion and the end of time-to-first-listing',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      price_bucket: { kind: 'enum', values: PRICE_BUCKETS },
      time_to_live_bucket: { kind: 'enum', values: TIME_TO_LIVE_BUCKETS },
      capture_state: { kind: 'enum', values: CAPTURE_STATES },
    },
    required: ['listing_ref', 'price_bucket', 'time_to_live_bucket'],
    optional: ['capture_state'],
    forbidden: ['title', 'price', 'price_cents', 'reviewer_id'],
  },

  inspect_static_fallback_shown: {
    name: 'inspect_static_fallback_shown',
    category: 'quality',
    purpose:
      'how often the static path is what a buyer actually got, and whether it was *complete*. Without this row the R270 decision is a feeling: the question is not "is 3D nice" but "what share of inspections could not have used it, and did the sufficient path show up when it had to"',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      reason: { kind: 'enum', values: STATIC_FALLBACK_REASONS },
      static_path_complete: { kind: 'boolean' },
      had_poster: { kind: 'boolean' },
      had_turntable: { kind: 'boolean' },
      had_disclosures: { kind: 'boolean' },
      turntable_frames: { kind: 'count', unit: 'count', max: 24 },
    },
    required: ['listing_ref', 'reason', 'static_path_complete'],
    optional: ['had_poster', 'had_turntable', 'had_disclosures', 'turntable_frames'],
    forbidden: ['title', 'asset_id', 'bucket_key', 'signed_url', 'url', 'capability_json'],
  },
  scene_budget_refused: {
    name: 'scene_budget_refused',
    category: 'quality',
    purpose: 'the byte gate refusing before the fetch — the difference between "3D is unavailable" and "we chose not to spend it on this connection"',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      requested_bytes: { kind: 'count', unit: 'bytes', max: 536_870_912 },
      verdict: { kind: 'enum', values: BUDGET_REFUSAL_VERDICTS },
      lod_tier: { kind: 'enum', values: LOD_TIERS },
      rendition_count: { kind: 'count', unit: 'count', max: 32 },
    },
    required: ['listing_ref', 'requested_bytes', 'verdict', 'lod_tier'],
    optional: ['rendition_count'],
    forbidden: ['bucket_key', 'signed_url', 'url', 'sha256', 'checksum', 'manifest'],
  },
  scene_telemetry: {
    name: 'scene_telemetry',
    category: 'quality',
    purpose: 'the numbers gate D1 reads (first paint, scene ready, governor level, LOD, bytes) from a real clock, so a slow scene is a measured fact rather than an anecdote',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      first_paint_ms: { kind: 'count', unit: 'ms', max: 120_000, nullable: true },
      scene_ready_ms: { kind: 'count', unit: 'ms', max: 300_000, nullable: true },
      governor_level: { kind: 'enum', values: GOVERNOR_LEVELS, nullable: true },
      lod_tier: { kind: 'enum', values: LOD_TIERS, nullable: true },
      bytes_fetched: { kind: 'count', unit: 'bytes', max: 536_870_912 },
      context_lost: { kind: 'boolean' },
    },
    required: ['listing_ref', 'bytes_fetched', 'context_lost'],
    optional: ['first_paint_ms', 'scene_ready_ms', 'governor_level', 'lod_tier'],
    forbidden: ['title', 'asset_id', 'frame_samples', 'shader_source', 'webgl_context_attributes'],
  },
  scene_context_lost: {
    name: 'scene_context_lost',
    category: 'quality',
    purpose: 'a WebGL context dropped mid-inspection, and whether the buyer landed on the complete static path afterwards',
    props: {
      listing_ref: { kind: 'ref', length: REF_LENGTH },
      recovered_via_static: { kind: 'boolean' },
    },
    required: ['listing_ref', 'recovered_via_static'],
    optional: [],
    forbidden: ['error_message', 'stack', 'driver', 'gpu', 'renderer'],
  },
  vital_recorded: {
    name: 'vital_recorded',
    category: 'quality',
    purpose: 'Core Web Vitals per route class, so the 170 KB first-paint promise is watched and not just gated at build time',
    props: {
      metric: { kind: 'enum', values: ['lcp', 'cls', 'inp', 'ttfb', 'fcp'] },
      rating: { kind: 'enum', values: ['good', 'needs_improvement', 'poor'] },
      route_class: { kind: 'enum', values: ROUTE_CLASSES },
      value_ms: { kind: 'count', unit: 'ms', max: 120_000 },
      value_ratio: { kind: 'ratio', max: 10 },
    },
    required: ['metric', 'rating'],
    optional: ['route_class', 'value_ms', 'value_ratio'],
    forbidden: ['element_selector', 'dom_path', 'navigation_id', 'url', 'route'],
  },
};

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

export function definitionOf<E extends EventName>(name: E): EventDefinition<E> {
  return EVENTS[name] as EventDefinition<E>;
}

export function categoryOf(name: EventName): ConsentCategory {
  return EVENTS[name].category;
}

/** Ref prop names for an event — `schema.ts` needs them to relax the digit-run rule, nowhere else. */
export function refPropsOf(name: EventName): string[] {
  const specs = EVENTS[name].props as Readonly<Record<string, PropSpec>>;
  return Object.entries(specs)
    .filter(([, spec]) => spec.kind === 'ref')
    .map(([key]) => key);
}

/**
 * The one helper features should call instead of putting a number in an event. Takes the `Money`
 * type so the cents are consumed here and cannot escape: the return type is a bucket, and there is
 * no path from `Money` to a raw number through this module.
 */
export function priceBucket(money: Money): (typeof PRICE_BUCKETS)[number] {
  return bucketPrice(money.cents);
}
