/**
 * Fixtures: one legal payload per event, the streams the funnels are tested against, and a set of
 * deliberately illegal payloads.
 *
 * The clean set is typed as `EventPropsMap[E]`, so `tsc` proves each fixture matches its event and
 * `no-pii.test.ts` proves the *schema* proves the same thing at runtime — the two together are what
 * makes "no PII" a claim about the whole catalogue rather than about whichever events a test happened
 * to write. `envelopeOf` stamps deterministic session and consent metadata so a funnel fixture is
 * reproducible without running a browser.
 *
 * The tainted set exists because a validator nobody feeds garbage to is unmeasured. Each entry names
 * the rule it is supposed to trip, so `no-pii.test.ts` fails if a detector is ever weakened silently.
 */
import type { ConsentCategory } from '../../lib/consent/types.js';
import type { ValidationErrorCode } from './schema.js';
import { type EventName, type EventPropsMap, categoryOf } from './events.js';
import type { EventEnvelope } from './transport.js';
import type { Batch, EventTransport, FlushReason, SendResult } from './transport.js';

/** Base32 without digits beyond 7, so a generated ref can never look like a phone number or an ID. */
const REF_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * Deterministic 24-char correlation ref. Built rather than written so a length change in `events.ts`
 * fails loudly here instead of in 40 pasted string literals.
 */
export function fixtureRef(label: string): string {
  let out = '';
  let h = 0x811c9dc5;
  const material = `ntm-fixture:${label}`;
  for (let i = 0; i < 24; i++) {
    h ^= material.charCodeAt(i % material.length) + i * 31;
    h = Math.imul(h, 0x01000193) >>> 0;
    out += REF_ALPHABET.charAt(h % REF_ALPHABET.length);
  }
  const first = out.charAt(0);
  return /[a-z]/.test(first) ? out : `f${out.slice(1)}`;
}

export const LISTING_REF_A = fixtureRef('listing-a');
export const LISTING_REF_B = fixtureRef('listing-b');
export const LISTING_REF_C = fixtureRef('listing-c');
export const ORDER_REF_A = fixtureRef('order-a');

/* ------------------------------------------------------------------ one legal payload per event */

export const CLEAN_FIXTURES: { readonly [E in EventName]: EventPropsMap[E] } = {
  consent_recorded: { category: 'measurement', outcome: 'granted', notice_version: 'popia-notice-2026-04' },
  session_rotated: { reason: 'consent_change', session_age_bucket: 'under_15m' },

  page_view: { route_pattern: '/item/:id', route_class: 'first-paint' },
  search_performed: {
    result_count_bucket: '6_20',
    has_results: true,
    request_failed: false,
    category_slug: 'pre-owned-watches',
    filter_count: 2,
    sort: 'relevance',
    page: 1,
  },
  listing_viewed: {
    listing_ref: LISTING_REF_A,
    has3d: true,
    poster_available: true,
    entry: 'search',
    price_bucket: '2700_5000',
    category_slug: 'pre-owned-watches',
    seller_tier: 'T4',
  },
  inspect_opened: { listing_ref: LISTING_REF_A, entry: 'item_page', gl_capability: 'webgl2' },
  checkout_started: { order_ref: ORDER_REF_A, price_bucket: '2700_5000', listing_ref: LISTING_REF_A, had_3d_inspection: true },
  payment_confirmed: {
    order_ref: ORDER_REF_A,
    from_state: 'AWAITING_PAYMENT',
    to_state: 'PAID',
    amount_bucket: '2700_5000',
    had_3d_inspection: true,
  },
  handover_scheduled: { order_ref: ORDER_REF_A, lead_time_bucket: '1_2_days', point_type: 'pickup_point' },
  handover_confirmed: { order_ref: ORDER_REF_A, pin_ok: true, same_day: false },
  dispute_raised: {
    order_ref: ORDER_REF_A,
    reason_code: 'condition_worse_than_disclosed',
    order_state: 'COMPLETED',
    had_3d_inspection: true,
  },

  seller_onboarded: { outcome: 'completed', tier: 'T2' },
  listing_draft_started: { listing_ref: LISTING_REF_C, category_slug: 'pre-owned-watches' },
  listing_created: { listing_ref: LISTING_REF_C, category_slug: 'pre-owned-watches', price_bucket: '2700_5000', static_path_only: false },
  listing_submitted: { listing_ref: LISTING_REF_C, price_bucket: '2700_5000', capture_requested: true },
  listing_published: {
    listing_ref: LISTING_REF_C,
    price_bucket: '2700_5000',
    time_to_live_bucket: '1_24h',
    capture_state: 'published',
  },

  inspect_static_fallback_shown: {
    listing_ref: LISTING_REF_B,
    reason: 'no_gl',
    static_path_complete: true,
    had_poster: true,
    had_turntable: true,
    had_disclosures: true,
    turntable_frames: 12,
  },
  scene_budget_refused: {
    listing_ref: LISTING_REF_B,
    requested_bytes: 2_100_000,
    verdict: 'over_budget',
    lod_tier: 'lod0',
    rendition_count: 3,
  },
  scene_telemetry: {
    listing_ref: LISTING_REF_A,
    first_paint_ms: 640,
    scene_ready_ms: 1850,
    governor_level: 'dpr',
    lod_tier: 'lod1',
    bytes_fetched: 900_000,
    context_lost: false,
  },
  scene_context_lost: { listing_ref: LISTING_REF_A, recovered_via_static: true },
  vital_recorded: { metric: 'lcp', rating: 'good', route_class: 'first-paint', value_ms: 1900 },
};

/** The unmeasured scene: every optional/nullable field absent or null, which the schema must accept. */
export const CLEAN_FIXTURES_MINIMAL: { readonly [E in EventName]?: EventPropsMap[E] } = {
  scene_telemetry: {
    listing_ref: LISTING_REF_B,
    first_paint_ms: null,
    scene_ready_ms: null,
    governor_level: null,
    lod_tier: null,
    bytes_fetched: 0,
    context_lost: false,
  },
  inspect_static_fallback_shown: {
    listing_ref: LISTING_REF_B,
    reason: 'no_3d_build',
    static_path_complete: true,
  },
  vital_recorded: { metric: 'cls', rating: 'needs_improvement' },
};

/* ------------------------------------------------------------------ streams */

export interface FixtureEvent<E extends EventName = EventName> {
  readonly name: E;
  readonly props: EventPropsMap[E];
  /** Millisecond offset from the stream origin, so durations are exact. */
  readonly at: number;
  readonly category?: ConsentCategory;
  readonly sessionId?: string;
}

export interface FixtureStreamOptions {
  readonly sessionId?: string;
  readonly originMs?: number;
  readonly consentVersion?: number;
  readonly noticeVersion?: string;
}

export function envelopeOf<E extends EventName>(
  event: FixtureEvent<E>,
  opts: FixtureStreamOptions = {},
): EventEnvelope<E> {
  const origin = opts.originMs ?? 1_770_000_000_000;
  return {
    name: event.name,
    category: event.category ?? categoryOf(event.name),
    occurredAt: origin + event.at,
    sessionId: event.sessionId ?? opts.sessionId ?? 'abcdefghijklmnopqrstuvwx',
    sessionEpoch: 1,
    consentVersion: opts.consentVersion ?? 3,
    noticeVersion: opts.noticeVersion ?? 'popia-notice-2026-04',
    appId: 'web-public',
    props: event.props,
  };
}

export function envelopesOf(events: readonly FixtureEvent[], opts: FixtureStreamOptions = {}): EventEnvelope[] {
  return events.map((e) => envelopeOf(e, opts));
}

/**
 * The load-bearing fixture: a buyer who inspects and buys with **no 3D at any point** — no
 * `scene_telemetry`, no `scene_context_lost`, not even a refusal. This is the stream that proves the
 * inspection funnel is completable on the static path, which is what the R270 argument has to be
 * measured against.
 */
export const STATIC_ONLY_BUYER_STREAM: readonly FixtureEvent[] = [
  { name: 'page_view', props: CLEAN_FIXTURES.page_view, at: 0 },
  { name: 'search_performed', props: CLEAN_FIXTURES.search_performed, at: 400 },
  {
    name: 'listing_viewed',
    props: { ...CLEAN_FIXTURES.listing_viewed, listing_ref: LISTING_REF_B, has3d: true },
    at: 1200,
  },
  { name: 'inspect_opened', props: { listing_ref: LISTING_REF_B, entry: 'item_page' }, at: 2600 },
  {
    name: 'inspect_static_fallback_shown',
    props: { ...CLEAN_FIXTURES.inspect_static_fallback_shown, listing_ref: LISTING_REF_B, reason: 'no_gl', static_path_complete: true },
    at: 2700,
  },
  { name: 'checkout_started', props: { order_ref: ORDER_REF_A, price_bucket: '2700_5000', listing_ref: LISTING_REF_B, had_3d_inspection: false }, at: 9400 },
  {
    name: 'payment_confirmed',
    props: { order_ref: ORDER_REF_A, from_state: 'AWAITING_PAYMENT', to_state: 'PAID', amount_bucket: '2700_5000', had_3d_inspection: false },
    at: 26_000,
  },
  { name: 'handover_scheduled', props: CLEAN_FIXTURES.handover_scheduled, at: 30_000 },
  { name: 'handover_confirmed', props: CLEAN_FIXTURES.handover_confirmed, at: 41 * 60 * 1000 },
];

/** The same buyer, one day later, on a device that could render the scene. */
export const SCENE_BUYER_STREAM: readonly FixtureEvent[] = [
  { name: 'page_view', props: CLEAN_FIXTURES.page_view, at: 0 },
  { name: 'listing_viewed', props: { ...CLEAN_FIXTURES.listing_viewed, has3d: true }, at: 900 },
  { name: 'inspect_opened', props: { listing_ref: LISTING_REF_A, entry: 'item_page', gl_capability: 'webgl2' }, at: 2100 },
  {
    name: 'scene_telemetry',
    props: { ...CLEAN_FIXTURES.scene_telemetry, listing_ref: LISTING_REF_A },
    at: 4050,
  },
  { name: 'checkout_started', props: CLEAN_FIXTURES.checkout_started, at: 12_000 },
  { name: 'payment_confirmed', props: CLEAN_FIXTURES.payment_confirmed, at: 28_000 },
];

/** An inspection opened where the byte gate refused before the fetch, then the static path carried it. */
export const BUDGET_REFUSED_STREAM: readonly FixtureEvent[] = [
  { name: 'inspect_opened', props: { listing_ref: LISTING_REF_B, entry: 'item_page', gl_capability: 'webgl2' }, at: 0 },
  { name: 'scene_budget_refused', props: { ...CLEAN_FIXTURES.scene_budget_refused, listing_ref: LISTING_REF_B }, at: 120 },
  {
    name: 'inspect_static_fallback_shown',
    props: { ...CLEAN_FIXTURES.inspect_static_fallback_shown, listing_ref: LISTING_REF_B, reason: 'budget_refused', static_path_complete: true },
    at: 180,
  },
];

/** A seller who gets a watch live inside an hour. */
export const SELLER_STREAM: readonly FixtureEvent[] = [
  { name: 'seller_onboarded', props: CLEAN_FIXTURES.seller_onboarded, at: 0 },
  { name: 'listing_draft_started', props: CLEAN_FIXTURES.listing_draft_started, at: 62_000 },
  { name: 'listing_created', props: CLEAN_FIXTURES.listing_created, at: 154_000 },
  { name: 'listing_submitted', props: CLEAN_FIXTURES.listing_submitted, at: 168_000 },
  { name: 'listing_published', props: CLEAN_FIXTURES.listing_published, at: 3_540_000 },
];

/** A seller who creates three listings and publishes one — the shape that makes listing→live < 1. */
export const SELLER_DROP_STREAM: readonly FixtureEvent[] = [
  { name: 'listing_created', props: { ...CLEAN_FIXTURES.listing_created, listing_ref: LISTING_REF_A }, at: 0 },
  { name: 'listing_created', props: { ...CLEAN_FIXTURES.listing_created, listing_ref: LISTING_REF_B }, at: 1000 },
  { name: 'listing_created', props: CLEAN_FIXTURES.listing_created, at: 2000 },
  { name: 'listing_submitted', props: { ...CLEAN_FIXTURES.listing_submitted, listing_ref: LISTING_REF_A }, at: 3000 },
  { name: 'listing_published', props: { ...CLEAN_FIXTURES.listing_published, listing_ref: LISTING_REF_A }, at: 9000 },
];

/** A scene that mounted and then lost its context, landing the buyer on the complete static path. */
export const CONTEXT_LOST_STREAM: readonly FixtureEvent[] = [
  { name: 'inspect_opened', props: { listing_ref: LISTING_REF_A, entry: 'item_page', gl_capability: 'webgl1' }, at: 0 },
  {
    name: 'scene_telemetry',
    props: { ...CLEAN_FIXTURES.scene_telemetry, listing_ref: LISTING_REF_A, context_lost: true, scene_ready_ms: null },
    at: 6200,
  },
  { name: 'scene_context_lost', props: { listing_ref: LISTING_REF_A, recovered_via_static: true }, at: 7400 },
  {
    name: 'inspect_static_fallback_shown',
    props: { ...CLEAN_FIXTURES.inspect_static_fallback_shown, listing_ref: LISTING_REF_A, reason: 'context_lost', static_path_complete: true },
    at: 7500,
  },
];

/* ------------------------------------------------------------------ the illegal set */

/** The expectation vocabulary is the validator's own error codes, not a second list to keep in sync. */
export type TaintKind = ValidationErrorCode;

export interface TaintedFixture {
  readonly label: string;
  readonly name: EventName;
  readonly props: Record<string, unknown>;
  readonly expect: TaintKind;
}

/**
 * Real-shaped values, not toy ones: `082 555 1234` is a Joburg mobile number and `8701015800027` is a
 * well-formed SA ID (Luhn-valid, born 1987-01-01). A detector that only catches `test@example.com`
 * would pass a test and miss the thing it exists for.
 *
 * `expect` is the code the validator actually returns, which is not always the code a reader would
 * guess: the schema is closed, so an undeclared property is refused by rule 1 before its value is
 * ever scanned. Where a name is *also* on the PII list, `forbidden_name` is the more precise refusal
 * and is what these fixtures assert.
 */
export const TAINTED_FIXTURES: readonly TaintedFixture[] = [
  {
    label: 'seller email pasted into a listing event',
    name: 'listing_viewed',
    props: { ...CLEAN_FIXTURES.listing_viewed, seller_email: 'thabiso.mokoena@example.co.za' },
    expect: 'forbidden_name',
  },
  {
    label: 'buyer email as a "contact" value on checkout',
    name: 'checkout_started',
    // `contact` is not a forbidden name and not a declared prop, so the closed schema is what stops
    // it — the email in the value is never read. Refused either way; this records which rule fired.
    props: { order_ref: ORDER_REF_A, price_bucket: '2700_5000', contact: 'buyer@nastech.co.za' },
    expect: 'unknown_property',
  },
  {
    label: 'ZA mobile number in a handover note',
    name: 'handover_scheduled',
    props: { order_ref: ORDER_REF_A, lead_time_bucket: 'same_day', point_type: 'pickup_point', rider_contact: '082 555 1234' },
    expect: 'unknown_property',
  },
  {
    label: 'SA ID number in a seller event',
    name: 'seller_onboarded',
    props: { outcome: 'completed', id_number: '8701015800027' },
    expect: 'forbidden_name',
  },
  {
    label: '13 Luhn-valid digits hiding in an allowed enum-shaped value',
    name: 'dispute_raised',
    props: { ...CLEAN_FIXTURES.dispute_raised, reason_code: '8701015800027' },
    expect: 'not_a_member',
  },
  {
    label: 'listing title in a search event (the obvious leak)',
    name: 'search_performed',
    props: { ...CLEAN_FIXTURES.search_performed, query: 'rolex datejust 41mm nobody else searched this' },
    expect: 'forbidden_name',
  },
  {
    label: 'free text smuggled through a slug field',
    name: 'listing_created',
    props: { ...CLEAN_FIXTURES.listing_created, category_slug: 'Seiko Presage 40.5mm automatic' },
    expect: 'bad_shape',
  },
  {
    label: 'exact price instead of a bucket',
    name: 'listing_viewed',
    props: { ...CLEAN_FIXTURES.listing_viewed, price_cents: 270_000 },
    expect: 'forbidden_name',
  },
  {
    label: 'rand-formatted amount inside an allowed string value',
    name: 'listing_created',
    props: { ...CLEAN_FIXTURES.listing_created, category_slug: 'pre-owned-watches', price_bucket: 'R2 700.00' },
    expect: 'not_a_member',
  },
  {
    label: 'raw listing id where a session ref belongs',
    name: 'inspect_opened',
    props: { listing_ref: 'lst_01', entry: 'item_page' },
    expect: 'bad_shape',
  },
  {
    label: 'signed media URL, whose query is the secret',
    name: 'inspect_static_fallback_shown',
    props: { ...CLEAN_FIXTURES.inspect_static_fallback_shown, poster: 'https://cdn.example.co.za/a/b/poster.jpg?X-Amz-Signature=deadbeef' },
    expect: 'unknown_property',
  },
  {
    label: 'the whole listing object, "it only has a few fields"',
    name: 'listing_viewed',
    props: { ...CLEAN_FIXTURES.listing_viewed, listing: { title: 'Casio F-91W, boxed', price: { cents: 45_000 } } },
    expect: 'unknown_property',
  },
  {
    label: 'a required field simply missing',
    name: 'payment_confirmed',
    props: { order_ref: ORDER_REF_A, to_state: 'PAID', amount_bucket: '2700_5000' },
    expect: 'missing_required',
  },
  {
    label: 'a value that cannot be serialised is refused rather than swallowed',
    name: 'vital_recorded',
    props: { metric: 'lcp', rating: 'good', value_ms: Number.NaN },
    expect: 'type_mismatch',
  },
];

/* ------------------------------------------------------------------ deterministic harness */

export interface FakeClock {
  readonly now: () => number;
  advance(ms: number): void;
  set(ms: number): void;
}

export function fakeClock(start = 1_770_000_000_000): FakeClock {
  let current = start;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
    set(ms: number) {
      current = ms;
    },
  };
}

/**
 * A CSPRNG stand-in that is *random enough to be unique and fixed enough to be reproducible*: a
 * seeded stream over the base32 alphabet. It is not a substitute for `crypto.getRandomValues` in the
 * app — `browserRandom` is the only production path — it exists so `session.test.ts` can assert that
 * the id is whatever the entropy source returned, nothing more and nothing derived.
 */
export function seededRandom(seed = 1): (count: number) => Uint8Array | null {
  let state = seed >>> 0 || 1;
  return (count: number) => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      out[i] = (state >>> 24) & 0xff;
    }
    return out;
  };
}

export function nullRandom(): (count: number) => Uint8Array | null {
  return () => null;
}

/** The fake transport the consent tests are required to use: records every call, decides nothing. */
export interface RecordingTransport extends EventTransport {
  readonly batches: readonly Batch[];
  readonly reasons: readonly FlushReason[];
  readonly eventNames: readonly string[];
  readonly batchesForCategory: (category: ConsentCategory) => readonly Batch[];
  setNextResult(result: SendResult): void;
  reset(): void;
}

export function recordingTransport(id = 'recording'): RecordingTransport {
  const batches: Batch[] = [];
  let next: SendResult | null = null;

  return {
    id,
    async send(batch): Promise<SendResult> {
      batches.push(batch);
      if (next !== null) {
        const result = next;
        next = null;
        return result;
      }
      return { ok: true, accepted: batch.events.length, via: 'fetch' };
    },
    get batches() {
      return batches;
    },
    get reasons() {
      return batches.map((b) => b.flushReason);
    },
    get eventNames() {
      return batches.flatMap((b) => b.events.map((e) => e.name));
    },
    batchesForCategory(category) {
      return batches.filter((b) => b.events.some((e) => e.category === category));
    },
    setNextResult(result) {
      next = result;
    },
    reset() {
      batches.length = 0;
      next = null;
    },
  };
}

/** A timer harness so `queue.test.ts` can drive the flush timer without sleeping. */
export interface FakeTimers {
  readonly set: (fn: () => void, ms: number) => number;
  readonly clear: (handle: number) => void;
  advance(ms: number): void;
  readonly pending: number;
}

export function fakeTimers(): FakeTimers {
  let handle = 0;
  const scheduled = new Map<number, { fn: () => void; at: number }>();
  let clock = 0;

  return {
    set(fn, ms) {
      handle += 1;
      scheduled.set(handle, { fn, at: clock + ms });
      return handle;
    },
    clear(h) {
      scheduled.delete(h);
    },
    advance(ms) {
      clock += ms;
      const due = [...scheduled.entries()].filter(([, t]) => t.at <= clock).sort((a, b) => a[1].at - b[1].at);
      for (const [h, t] of due) {
        scheduled.delete(h);
        t.fn();
      }
    },
    get pending() {
      return scheduled.size;
    },
  };
}

/** A visibility/unload harness: the tests fire these, so no jsdom is needed for the lifecycle paths. */
export interface FakeLifecycle {
  fireVisibility(state: DocumentVisibilityState): void;
  firePagehide(): void;
  readonly visibility: { state: () => DocumentVisibilityState; onChange: (fn: () => void) => () => void };
  readonly unload: { onPagehide: (fn: () => void) => () => void };
  setVisibility(state: DocumentVisibilityState): void;
}

export function fakeLifecycle(initial: DocumentVisibilityState = 'visible'): FakeLifecycle {
  let visibilityState = initial;
  const visibilityHandlers = new Set<() => void>();
  const pagehideHandlers = new Set<() => void>();

  return {
    fireVisibility(state) {
      visibilityState = state;
      for (const fn of visibilityHandlers) fn();
    },
    firePagehide() {
      for (const fn of pagehideHandlers) fn();
    },
    setVisibility(state) {
      visibilityState = state;
    },
    visibility: {
      state: () => visibilityState,
      onChange(fn) {
        visibilityHandlers.add(fn);
        return () => visibilityHandlers.delete(fn);
      },
    },
    unload: {
      onPagehide(fn) {
        pagehideHandlers.add(fn);
        return () => pagehideHandlers.delete(fn);
      },
    },
  };
}
