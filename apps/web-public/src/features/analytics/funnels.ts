/**
 * The four funnels 04's exit tests read, expressed as event sequences so they are computable and
 * testable rather than described in a slide.
 *
 * A funnel here is *data*, not a SQL query someone writes later, and that choice is the entire point:
 *  · the step order is checkable in a test, so "inspection→purchase" cannot quietly become
 *    "inspection→scene→purchase" six weeks before the exit review;
 *  · `requiresScene` is a property of the definition, and `funnels.test.ts` asserts it is false for
 *    every funnel that a buyer can complete — which is the machine-checkable form of "3D is never
 *    load-bearing";
 *  · the numbers come out of an array of envelopes, so the same function runs against fixtures in CI
 *    and against the query layer in review, and a reviewer can hold one fixture and check the maths.
 *
 * Consent note that has to stay in this file, not only in the README: every funnel here is computed
 * from the *consented cohort*. `consent_recorded` is in the `essential` category precisely so the
 * consent rate — and therefore the size of the error bar on every number below — is always available.
 */
import { bucketPrice, PRICE_BUCKETS, PRICE_BUCKET_EDGES_CENTS } from './pii-guards.js';
import { categoryOf, type EventName } from './events.js';
import type { EventEnvelope } from './transport.js';

export type FunnelId = 'time_to_first_listing' | 'listing_to_live' | 'inspection_to_purchase' | 'three_d_availability';

export interface FunnelStep {
  readonly event: EventName;
  readonly label: string;
  /** Events that also satisfy this step, for a step with more than one way to be reached. */
  readonly alternatives?: readonly EventName[];
}

export interface FunnelDefinition {
  readonly id: FunnelId;
  readonly title: string;
  /** The question in the words the exit test uses. If a funnel cannot state one, delete it. */
  readonly question: string;
  readonly steps: readonly FunnelStep[];
  /**
   * False for every funnel a *buyer* completes. True only where the sequence is literally about the
   * scene runtime, which is the R270 measurement and is allowed to depend on 3D because its whole
   * purpose is to ask whether 3D happened.
   */
  readonly requiresScene: boolean;
  /** Which consent categories must be granted for this funnel to have any rows at all. */
  readonly consentNeeded: readonly ('quality' | 'measurement')[];
  readonly measure: 'conversion' | 'conversion_with_duration' | 'outcome_share';
  /** How the exit test reads the result, in one line, including what a bad number would mean. */
  readonly reading: string;
}

/** Events whose presence means "a WebGL scene actually ran". Kept in one list so the requiresScene check is total. */
export const SCENE_EVENTS: readonly EventName[] = ['scene_telemetry', 'scene_context_lost'];

export const FUNNELS: Readonly<Record<FunnelId, FunnelDefinition>> = {
  time_to_first_listing: {
    id: 'time_to_first_listing',
    title: 'Time to first listing',
    question: 'How long does a new seller take, from finishing onboarding to having something buyable on the site?',
    steps: [
      { event: 'seller_onboarded', label: 'onboarding completed' },
      { event: 'listing_draft_started', label: 'draft started' },
      { event: 'listing_created', label: 'listing saved' },
      { event: 'listing_submitted', label: 'submitted for review' },
      { event: 'listing_published', label: 'live' },
    ],
    requiresScene: false,
    consentNeeded: ['measurement'],
    measure: 'conversion_with_duration',
    reading:
      'p50 and p90 of the elapsed time from onboarding to `listing_published`, plus the share that never publish. A p90 in days means the listing form or the review queue is where sellers are lost, not that sellers are not interested.',
  },
  listing_to_live: {
    id: 'listing_to_live',
    title: 'Listing → live conversion',
    question: 'What share of listings a seller actually creates reach "live"?',
    steps: [
      { event: 'listing_created', label: 'created' },
      { event: 'listing_submitted', label: 'submitted' },
      { event: 'listing_published', label: 'live' },
    ],
    requiresScene: false,
    consentNeeded: ['measurement'],
    measure: 'conversion',
    // CONTRACT-GAP: the question is about *listings* and the engine counts *sessions*. A seller who
    // creates three listings and publishes one is one conversion here, not one third. The item-level
    // ratio is computable from the events (`listing_ref` is on all three steps) but needs a unit on
    // FunnelDefinition and a decision about a seller who creates one listing in five sessions; the
    // controller should choose, and until then this reading states the unit the number is in rather
    // than the one the question asks for.
    reading:
      'Sessions in which a created listing reached live — a per-seller rate, not published ÷ created. The drop between created and submitted is seller effort; the drop between submitted and live is us. Those two need different fixes, so the per-step drop table matters more than the headline ratio.',
  },
  inspection_to_purchase: {
    id: 'inspection_to_purchase',
    title: 'Inspection → purchase',
    question: 'Does a buyer who inspects an item go on to pay for it — and does it matter whether they inspected in 3D or on the static path?',
    steps: [
      { event: 'listing_viewed', label: 'listing seen' },
      // The step is *opening* the inspection surface, not rendering a scene. The static path —
      // poster, 12-frame turntable, written condition disclosures — is this step satisfied.
      { event: 'inspect_opened', label: 'inspection opened (static or 3D)' },
      { event: 'checkout_started', label: 'checkout started' },
      { event: 'payment_confirmed', label: 'paid' },
    ],
    requiresScene: false,
    consentNeeded: ['measurement'],
    measure: 'conversion',
    reading:
      'paid ÷ inspection opened, segmented by `had_3d_inspection` at the checkout and payment events. The segmentation is the R270 argument in the other direction: if the static segment converts the same, the capture programme is not buying conversion.',
  },
  three_d_availability: {
    id: 'three_d_availability',
    title: '3D availability and the capture cost question',
    question: 'Of the inspections that were opened, what share could actually be served a scene, and is the capture programme earning R270 an item?',
    steps: [
      { event: 'inspect_opened', label: 'inspection opened' },
      { event: 'scene_telemetry', label: 'scene ran', alternatives: ['inspect_static_fallback_shown', 'scene_budget_refused', 'scene_context_lost'] },
    ],
    requiresScene: true,
    consentNeeded: ['quality', 'measurement'],
    measure: 'outcome_share',
    reading:
      'Shares per outcome: scene ran, static fallback, budget refused, context lost. Multiply the "could not run 3D" share by the number of captured items to get the share of R270 that never reached a buyer, and read it against the price-bucket economics below.',
  },
};

export const FUNNEL_IDS = Object.keys(FUNNELS) as FunnelId[];

/* ------------------------------------------------------------------ evaluation */

export interface StepCount {
  readonly event: EventName;
  readonly label: string;
  readonly reached: number;
  /** Reached at this step but never at the next one. */
  readonly droppedHere: number;
}

export interface DurationSummary {
  readonly p50Ms: number | null;
  readonly p90Ms: number | null;
  readonly maxMs: number | null;
  readonly samples: number;
}

export interface OutcomeShares {
  readonly sceneRan: number;
  readonly staticFallback: number;
  readonly budgetRefused: number;
  readonly contextLost: number;
  readonly unresolved: number;
  readonly total: number;
  /** The number the R270 decision needs: inspections where a scene never reached the buyer. */
  readonly unavailableShare: number;
}

export interface FunnelResult {
  readonly id: FunnelId;
  readonly title: string;
  readonly question: string;
  /** Sessions the funnel was actually computed over — the consented cohort, not everything received. */
  readonly sessions: number;
  readonly completed: number;
  /** `completed ÷ sessions`, or null for an empty cohort so a zero-sample read cannot look like 0 %. */
  readonly conversion: number | null;
  readonly steps: readonly StepCount[];
  readonly duration: DurationSummary | null;
  readonly outcomes: OutcomeShares | null;
  /** Sessions left out of every number above because their consent state cannot support this funnel. */
  readonly excludedNoConsent: number;
}

interface Session {
  readonly id: string;
  readonly events: readonly EventEnvelope[];
}

function groupBySession(envelopes: readonly EventEnvelope[]): Session[] {
  const map = new Map<string, EventEnvelope[]>();
  for (const e of envelopes) {
    const list = map.get(e.sessionId);
    if (list === undefined) map.set(e.sessionId, [e]);
    else list.push(e);
  }
  return [...map.entries()].map(([id, events]) => ({
    id,
    // Order by occurrence, with the emit order as a deterministic tie-break: two events stamped in
    // the same millisecond still have a first and a second.
    events: [...events].sort((a, b) => a.occurredAt - b.occurredAt || a.sessionEpoch - b.sessionEpoch),
  }));
}

function matches(step: FunnelStep, name: EventName): boolean {
  return step.event === name || (step.alternatives?.includes(name) ?? false);
}

/**
 * Whether the consent actually recorded in this session can support this funnel at all.
 *
 * The stream is the evidence: `consent/gates.ts` refuses to emit a category that was not granted, so a
 * category with rows here *was* granted, and a category with no rows has nothing to answer from. This
 * is a proxy, and its asymmetry is deliberate: a missing `quality` category is treated as a real
 * exclusion (a buyer who never let the runtime report, so their inspections cannot feed the 3D answer),
 * while a missing `measurement` category is not — a buyer who refused measurement has no measurement
 * rows either, and treating that as an exclusion would silently drop sessions that simply have no
 * recorded activity yet and inflate the drop-off in every seller funnel.
 */
function consentSupported(session: Session, def: FunnelDefinition): boolean {
  return def.consentNeeded.every((c) => c === 'measurement' || session.events.some((e) => e.category === c));
}

/** Percentile by nearest rank on a sorted array; empty input gives null, never 0. */
function percentile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export function evaluateFunnel(id: FunnelId, envelopes: readonly EventEnvelope[]): FunnelResult {
  const def = FUNNELS[id];
  const sessions = groupBySession(envelopes);

  const reachedPerStep: number[] = def.steps.map(() => 0);
  let completed = 0;
  const durations: number[] = [];
  let evaluated = 0;
  let excludedNoConsent = 0;

  const outcomeCounts = { sceneRan: 0, staticFallback: 0, budgetRefused: 0, contextLost: 0, unresolved: 0 };
  let outcomeTotal = 0;

  for (const session of sessions) {
    // Excluded means excluded: a session whose consent cannot support this funnel contributes no step,
    // no outcome and no denominator. Counting it anyway and reporting the exclusion as a number next to
    // the result would make the result wrong.
    if (!consentSupported(session, def)) {
      excludedNoConsent += 1;
      continue;
    }
    evaluated += 1;

    // Walk the steps in order, each search starting after the previous step's match: a funnel is a
    // sequence, not a set, and a payment that happened *before* the view is not a conversion.
    let cursor = -1;
    let stepIndex = 0;
    for (const [i, step] of def.steps.entries()) {
      const found = session.events.findIndex((e, idx) => idx > cursor && matches(step, e.name));
      if (found === -1) break;
      cursor = found;
      reachedPerStep[i] = (reachedPerStep[i] ?? 0) + 1;
      stepIndex = i + 1;
    }
    if (stepIndex === def.steps.length) {
      completed += 1;
      const first = session.events.findIndex((e) => matches(def.steps[0] as FunnelStep, e.name));
      const anchor = first >= 0 ? (session.events[first] as EventEnvelope).occurredAt : null;
      if (def.measure === 'conversion_with_duration' && anchor !== null) {
        // The duration is measured to the *last step of the sequence*, not the last event in the
        // session: a seller who lists something and then keeps browsing must not look like a 40-minute listing.
        const end = session.events.findLastIndex((e) => matches(def.steps[def.steps.length - 1] as FunnelStep, e.name));
        const endEvent = end >= 0 ? session.events[end] : undefined;
        if (endEvent !== undefined) durations.push(Math.max(0, endEvent.occurredAt - anchor));
      }
    }

    if (def.measure === 'outcome_share') {
      const opened = session.events.some((e) => e.name === 'inspect_opened');
      if (!opened) continue;
      outcomeTotal += 1;
      const ran = session.events.some((e) => e.name === 'scene_telemetry' && (e.props as { scene_ready_ms?: number | null }).scene_ready_ms != null);
      const lost = session.events.some((e) => e.name === 'scene_context_lost');
      const refused = session.events.some((e) => e.name === 'scene_budget_refused');
      const fellBack = session.events.some((e) => e.name === 'inspect_static_fallback_shown');
      if (ran && !lost) outcomeCounts.sceneRan += 1;
      else if (refused) outcomeCounts.budgetRefused += 1;
      else if (lost) outcomeCounts.contextLost += 1;
      else if (fellBack) outcomeCounts.staticFallback += 1;
      else outcomeCounts.unresolved += 1;
    }
  }

  const steps: StepCount[] = def.steps.map((step, i) => {
    const reached = reachedPerStep[i] ?? 0;
    const nextReached = i + 1 < def.steps.length ? (reachedPerStep[i + 1] ?? 0) : completed;
    return { event: step.event, label: step.label, reached, droppedHere: Math.max(0, reached - nextReached) };
  });

  const sorted = [...durations].sort((a, b) => a - b);
  const outcomes: OutcomeShares | null =
    def.measure === 'outcome_share' && outcomeTotal > 0
      ? {
          ...outcomeCounts,
          total: outcomeTotal,
          unavailableShare: share(outcomeTotal, outcomeCounts.staticFallback + outcomeCounts.budgetRefused + outcomeCounts.contextLost),
        }
      : def.measure === 'outcome_share'
        ? { ...outcomeCounts, total: 0, unavailableShare: 0 }
        : null;

  return {
    id,
    title: def.title,
    question: def.question,
    sessions: evaluated,
    completed,
    conversion: evaluated === 0 ? null : share(evaluated, completed),
    steps,
    duration:
      def.measure === 'conversion_with_duration'
        ? { p50Ms: percentile(sorted, 0.5), p90Ms: percentile(sorted, 0.9), maxMs: percentile(sorted, 1), samples: sorted.length }
        : null,
    outcomes,
    excludedNoConsent,
  };
}

function share(of: number, outOf: number): number {
  return of === 0 ? 0 : Math.round((outOf / of) * 10_000) / 10_000;
}

/* ------------------------------------------------------------------ the "needs no 3D" proof */

/** Every step event of a funnel that implies a WebGL scene ran. */
export function sceneStepsOf(id: FunnelId): EventName[] {
  const def = FUNNELS[id];
  const out: EventName[] = [];
  for (const step of def.steps) {
    if (SCENE_EVENTS.includes(step.event)) out.push(step.event);
    for (const alt of step.alternatives ?? []) if (SCENE_EVENTS.includes(alt)) out.push(alt);
  }
  return out;
}

/**
 * The claim "3D is never load-bearing", as a function.
 *
 * A funnel is completable without a scene when none of its *required* steps is a scene event — an
 * alternative may mention one (the availability funnel does, by design) but a required step may not.
 * `funnels.test.ts` asserts this over every buyer-side funnel and separately asserts that a fixture
 * stream with zero scene events still reaches `payment_confirmed`.
 */
export function completableWithout3d(id: FunnelId): boolean {
  const def = FUNNELS[id];
  return def.steps.every((step) => !SCENE_EVENTS.includes(step.event));
}

/** Categories an event belongs to, exposed for the consent-requirement assertion. */
export function categoryOfStep(event: EventName): ReturnType<typeof categoryOf> {
  return categoryOf(event);
}

/* ------------------------------------------------------------------ capture economics */

/**
 * CONTRACT-GAP: mirrors `CAPTURE_COST_CENTS` / `TAKE_RATE` / `BREAK_EVEN_CENTS` from
 * `tooling/asset-pipeline/intake-receipt.ts`, which cannot be bundled into a browser app because it
 * imports `node:crypto`. These belong in `@nastech/api-contracts` beside `budgets` — money and bytes
 * are both rationed resources — and the controller should move them there and delete this mirror.
 */
export const CAPTURE_COST_CENTS = 27_000;
export const TAKE_RATE = 0.1;
export const BREAK_EVEN_CENTS = Math.round(CAPTURE_COST_CENTS / TAKE_RATE);

export interface BucketEconomics {
  readonly bucket: (typeof PRICE_BUCKETS)[number];
  readonly lowerCents: number;
  readonly upperCents: number | null;
  readonly commissionAtLowerBoundCents: number;
  readonly headroomAtLowerBoundCents: number;
  /** Deliberately false for `under_500` … `2000_2700`: the bottom of the bucket cannot pay for capture. */
  readonly viableAtLowerBound: boolean;
  /**
   * True for a bucket whose *best* price still falls under break-even, so the answer is a flat no and
   * needs no position assumption either. Not defined as the complement of `viableAtLowerBound`: a bucket
   * where both are false answers neither way and is reported by `straddlingBuckets`. With the edges
   * where they are, none exists.
   */
  readonly cannotPayAtUpperBound: boolean;
}

/**
 * Why a bucket is enough to answer a money question.
 *
 * The R270 decision needs "does commission beat capture cost", and commission is monotonic in price,
 * so a bucket whose *lower bound* clears break-even answers yes without knowing the price, and a bucket
 * whose *best* price still falls under it answers no. `PRICE_BUCKET_EDGES_CENTS` are exclusive upper
 * bounds — an item at exactly R2 700,00 is bucketed in `2700_5000` — and the break-even line is one of
 * those edges, so no bucket straddles it: the answer is yes from `2700_5000` up and no below it. That
 * is the argument for "if a funnel needs a price, it needs a bucket": the decision survives the
 * rounding, and here it survives it exactly, because the edge was placed on the line on purpose.
 */
export function bucketEconomics(): BucketEconomics[] {
  return PRICE_BUCKETS.map((bucket, i) => {
    const lowerCents = i === 0 ? 0 : (PRICE_BUCKET_EDGES_CENTS[i - 1] ?? 0);
    const upperCents = i < PRICE_BUCKET_EDGES_CENTS.length ? (PRICE_BUCKET_EDGES_CENTS[i] ?? null) : null;
    const commission = Math.floor(lowerCents * TAKE_RATE);
    // The most an item in this bucket can cost. `over_10000` has no ceiling, so it has no "best case"
    // to fail against — it is never reported as unable to pay.
    const bestCents = upperCents === null ? null : upperCents - 1;
    const commissionAtBest = bestCents === null ? null : Math.floor(bestCents * TAKE_RATE);
    return {
      bucket,
      lowerCents,
      upperCents,
      commissionAtLowerBoundCents: commission,
      headroomAtLowerBoundCents: commission - CAPTURE_COST_CENTS,
      viableAtLowerBound: commission >= CAPTURE_COST_CENTS,
      cannotPayAtUpperBound: commissionAtBest !== null && commissionAtBest < CAPTURE_COST_CENTS,
    };
  });
}

export interface CaptureEconomics {
  /** Distinct items whose inspection actually ran a scene. */
  readonly itemsWithScene: number;
  readonly itemsStaticOnly: number;
  readonly itemsBudgetRefused: number;
  /** `inspect_opened` events with no scene outcome recorded — a measurement gap, reported as one. */
  readonly itemsUnresolved: number;
  readonly unavailableShare: number;
  /** Buckets where capture pays for itself at the bucket floor, and any that answers neither way. */
  readonly viableBuckets: readonly (typeof PRICE_BUCKETS)[number][];
  readonly straddlingBuckets: readonly (typeof PRICE_BUCKETS)[number][];
  /** Spend, in rand, that produced no scene for the buyer, given the outcome shares. */
  readonly captureCostWastedCents: number;
  readonly reading: string;
}

/**
 * The R270 answer, computed from `three_d_availability` outcomes plus the price buckets of the items
 * that were captured. `priceCounts` is a bucket → item-count map, which is exactly what the events
 * carry (`price_bucket` on the listing events) and exactly what is lawful to carry.
 */
export function captureEconomics(
  availability: FunnelResult,
  priceCounts: Readonly<Partial<Record<(typeof PRICE_BUCKETS)[number], number>>>,
): CaptureEconomics {
  const outcomes = availability.outcomes;
  const total = outcomes?.total ?? 0;
  const economics = bucketEconomics();
  const viable = economics.filter((e) => e.viableAtLowerBound).map((e) => e.bucket);
  // A bucket straddles only if neither end answers: too cheap at the ceiling is a no, affordable at
  // the floor is a yes. The current ladder has no such bucket — break-even is an edge — so this is
  // deliberately an empty list that would fill itself if the edges were ever moved off the line.
  const straddling = economics.filter((e) => !e.viableAtLowerBound && !e.cannotPayAtUpperBound).map((e) => e.bucket);

  const capturedItems = Object.values(priceCounts).reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const unavailable = outcomes === null ? 0 : outcomes.staticFallback + outcomes.budgetRefused + outcomes.contextLost;
  const unavailableShare = total === 0 ? 0 : unavailable / total;

  return {
    itemsWithScene: outcomes?.sceneRan ?? 0,
    itemsStaticOnly: outcomes?.staticFallback ?? 0,
    itemsBudgetRefused: outcomes?.budgetRefused ?? 0,
    itemsUnresolved: outcomes?.unresolved ?? 0,
    unavailableShare: Math.round(unavailableShare * 10_000) / 10_000,
    viableBuckets: viable,
    straddlingBuckets: straddling,
    // The blunt version of the question: capture was paid for `capturedItems`, and a share of the
    // inspections never saw a scene. Reported to the cent so nobody rounds it into a conclusion.
    captureCostWastedCents: Math.round(capturedItems * CAPTURE_COST_CENTS * unavailableShare),
    reading:
      capturedItems === 0
        ? 'No captured items supplied, so the cost side is unknown; the availability share is still the read on whether 3D could have been shown at all.'
        : `${Math.round(unavailableShare * 100)} % of inspections never reached a scene. At ${PRICE_BUCKETS.length} price buckets and a ${Math.round(TAKE_RATE * 100)} % take rate, capture pays for itself at the floor of ${viable.join(', ')}${
            straddling.length === 0
              ? `, and no bucket straddles the break-even line, so a bucket alone answers the money question.`
              : ` — but ${straddling.join(', ')} straddles the line and needs a price, not a bucket.`
          }`,
  };
}

/** Convenience: the bucket for a `Money`-shaped cents value, re-exported so features import one thing. */
export { bucketPrice };

/** For diagnostics screens: which consent a funnel needs and which categories its steps actually belong to. */
export function funnelConsentSummary(id: FunnelId): string {
  const def = FUNNELS[id];
  const categories = [...new Set(def.steps.map((s) => categoryOf(s.event)))];
  return `${def.title}: needs consent for ${def.consentNeeded.join(' + ')}; step categories are ${categories.join(', ')}`;
}
