/**
 * `funnels.test.ts` — the file the four funnel definitions and the R270 argument are checked against.
 *
 * Three claims hold the measurement plan up, and each is an assertion here rather than a paragraph:
 *
 *  1. **"3D is never load-bearing."** Stated as data: no buyer-completable funnel has a scene event as a
 *     *required* step, and a fixture stream containing zero scene events still reaches
 *     `payment_confirmed`. Either could be quietly untrue; both are decided by CI instead of by reading.
 *  2. **"A funnel is a sequence, not a set."** A payment that happened before the listing was seen is
 *     not a conversion. If the engine ever regresses to "did this session contain all four events", the
 *     headline rate rises and nothing else notices — so the out-of-order fixture is the most important
 *     test in this file.
 *  3. **"Every number comes from the consented cohort."** A session whose recorded consent cannot
 *     support the funnel contributes no step, no outcome and no denominator. `excludedNoConsent` has to
 *     be true of the numbers printed next to it, or it is decoration.
 *
 * The outcome shares are asserted per fixture *and* combined, because the property that matters is that
 * they add up: one cohort, four inspections, one scene, three ways of not getting one.
 */
import { describe, expect, it } from 'bun:test';
import type { EventEnvelope } from '../transport.js';
import {
  BREAK_EVEN_CENTS,
  CAPTURE_COST_CENTS,
  FUNNEL_IDS,
  FUNNELS,
  SCENE_EVENTS,
  TAKE_RATE,
  bucketEconomics,
  captureEconomics,
  completableWithout3d,
  evaluateFunnel,
  sceneStepsOf,
  type FunnelId,
  type FunnelResult,
} from '../funnels.js';
import {
  BUDGET_REFUSED_STREAM,
  CLEAN_FIXTURES,
  CONTEXT_LOST_STREAM,
  LISTING_REF_A,
  SCENE_BUYER_STREAM,
  SELLER_DROP_STREAM,
  SELLER_STREAM,
  STATIC_ONLY_BUYER_STREAM,
  envelopeOf,
  envelopesOf,
  fixtureRef,
  type FixtureEvent,
} from '../fixtures.js';
import { PRICE_BUCKETS } from '../pii-guards.js';

const SESSION_IDS = ['seller-1', 'seller-2', 'seller-3', 'buyer-1', 'buyer-2', 'buyer-3', 'buyer-4'].map(fixtureRef);

/** One session id per stream, so a fixture stays a single-buyer story and a cohort stays a cohort. */
function sessionAt(index: number): string {
  return SESSION_IDS[index] as string;
}

/** Four buyer streams, four sessions, one cohort — the shape the availability funnel is read over. */
function buyerCohort(): EventEnvelope[] {
  return [STATIC_ONLY_BUYER_STREAM, SCENE_BUYER_STREAM, BUDGET_REFUSED_STREAM, CONTEXT_LOST_STREAM].flatMap((stream, i) =>
    envelopesOf(stream, { sessionId: sessionAt(4 + i) }),
  );
}

function availability(stream: readonly FixtureEvent[]): FunnelResult {
  return evaluateFunnel('three_d_availability', envelopesOf(stream));
}

function sellerStreamPublishingAt(publishAtMs: number): readonly FixtureEvent[] {
  return [
    { name: 'seller_onboarded', props: CLEAN_FIXTURES.seller_onboarded, at: 0 },
    { name: 'listing_draft_started', props: CLEAN_FIXTURES.listing_draft_started, at: 1000 },
    { name: 'listing_created', props: CLEAN_FIXTURES.listing_created, at: 2000 },
    { name: 'listing_submitted', props: CLEAN_FIXTURES.listing_submitted, at: 3000 },
    { name: 'listing_published', props: CLEAN_FIXTURES.listing_published, at: publishAtMs },
  ];
}

/* ------------------------------------------------------------------ the definitions */

describe('the four funnels are the exit tests, written as data', () => {
  it('there are exactly four, each keyed by its own id and asking one question', () => {
    expect([...FUNNEL_IDS].sort()).toEqual([
      'inspection_to_purchase',
      'listing_to_live',
      'three_d_availability',
      'time_to_first_listing',
    ]);
    for (const id of FUNNEL_IDS) {
      const def = FUNNELS[id];
      expect(def.id).toBe(id);
      expect(def.question).toContain('?');
      expect(def.steps.length).toBeGreaterThan(1);
      expect(def.reading.length).toBeGreaterThan(40);
      expect(def.reading).not.toContain('\n');
    }
  });

  it('only the funnel that measures the scene runtime is allowed to depend on it', () => {
    // FUNNEL_IDS is declaration order: the two seller funnels, then inspection, then availability.
    expect(FUNNEL_IDS.map((id) => FUNNELS[id].requiresScene)).toEqual([false, false, false, true]);
  });

  it('"3D is never load-bearing" is the same statement as "no required step is a scene event"', () => {
    for (const id of FUNNEL_IDS) {
      // `completableWithout3d` looks only at required steps; `sceneStepsOf` also walks alternatives.
      // An empty scene-step list is therefore exactly the funnels that never mention a scene at all.
      expect(sceneStepsOf(id).length === 0).toBe(completableWithout3d(id));
    }
    expect(FUNNEL_IDS.map(completableWithout3d)).toEqual([true, true, true, false]);
  });

  it('the availability funnel names its scene steps, so the exception is auditable not implied', () => {
    expect(sceneStepsOf('three_d_availability')).toEqual(['scene_telemetry', 'scene_context_lost']);
    expect(sceneStepsOf('inspection_to_purchase')).toEqual([]);
    expect(SCENE_EVENTS).toEqual(['scene_telemetry', 'scene_context_lost']);
  });

  it('a funnel that needs a consent category says which one', () => {
    expect(FUNNEL_IDS.map((id) => [...FUNNELS[id].consentNeeded])).toEqual([
      ['measurement'],
      ['measurement'],
      ['measurement'],
      ['quality', 'measurement'],
    ]);
  });
});

/* ------------------------------------------------------------------ sequence, not a set */

describe('the walk is a sequence, and the fixtures are the proof', () => {
  it('a buyer on the static path completes inspection → purchase with no scene event at all', () => {
    const envelopes = envelopesOf(STATIC_ONLY_BUYER_STREAM);
    expect(envelopes.filter((e) => SCENE_EVENTS.includes(e.name))).toEqual([]);
    const result = evaluateFunnel('inspection_to_purchase', envelopes);
    expect(result.sessions).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.conversion).toBe(1);
    expect(result.steps.map((s) => [s.reached, s.droppedHere])).toEqual([
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
    ]);
  });

  it('the same buyer with a scene converts too, so the segment comparison is like for like', () => {
    expect(evaluateFunnel('inspection_to_purchase', envelopesOf(SCENE_BUYER_STREAM)).conversion).toBe(1);
    // `had_3d_inspection` is what the exit test segments on, and the static fixture carries false.
    const checkout = envelopesOf(SCENE_BUYER_STREAM).find((e) => e.name === 'checkout_started');
    const staticCheckout = envelopesOf(STATIC_ONLY_BUYER_STREAM).find((e) => e.name === 'checkout_started');
    expect((checkout as EventEnvelope).props).toMatchObject({ had_3d_inspection: true });
    expect((staticCheckout as EventEnvelope).props).toMatchObject({ had_3d_inspection: false });
  });

  it('a payment that happened before the listing was seen is not a conversion', () => {
    const outOfOrder: readonly FixtureEvent[] = [
      { name: 'payment_confirmed', props: CLEAN_FIXTURES.payment_confirmed, at: 0 },
      { name: 'listing_viewed', props: CLEAN_FIXTURES.listing_viewed, at: 100 },
      { name: 'inspect_opened', props: { listing_ref: LISTING_REF_A, entry: 'item_page' }, at: 200 },
      { name: 'checkout_started', props: CLEAN_FIXTURES.checkout_started, at: 300 },
    ];
    const result = evaluateFunnel('inspection_to_purchase', envelopesOf(outOfOrder));
    expect(result.completed).toBe(0);
    expect(result.conversion).toBe(0);
    // The loss is reported at the step where it happened, which is the whole point of `droppedHere`.
    expect(result.steps.map((s) => [s.reached, s.droppedHere])).toEqual([
      [1, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  it('flush order does not matter, because the session is sorted by occurrence before the walk', () => {
    const rotated = [...STATIC_ONLY_BUYER_STREAM.slice(4), ...STATIC_ONLY_BUYER_STREAM.slice(0, 4)];
    expect(rotated[0]?.name).toBe('inspect_static_fallback_shown');
    expect(evaluateFunnel('inspection_to_purchase', envelopesOf(rotated)).completed).toBe(1);
  });

  it('a seller who creates and never submits drops at created, not at the end', () => {
    const stalled: readonly FixtureEvent[] = [
      { name: 'listing_draft_started', props: CLEAN_FIXTURES.listing_draft_started, at: 0 },
      { name: 'listing_created', props: CLEAN_FIXTURES.listing_created, at: 1000 },
    ];
    const result = evaluateFunnel('listing_to_live', envelopesOf(stalled));
    expect(result.completed).toBe(0);
    expect(result.steps.map((s) => s.reached)).toEqual([1, 0, 0]);
    expect(result.steps[0]?.droppedHere).toBe(1);
  });

  it('a seller with three listings and one publish is one session conversion, and the reading says so', () => {
    const result = evaluateFunnel('listing_to_live', envelopesOf(SELLER_DROP_STREAM));
    expect(result.completed).toBe(1);
    expect(result.conversion).toBe(1);
    // CONTRACT-GAP: the funnel counts sessions, so this is 1 of 1 rather than the 1 of 3 the item-level
    // question asks. The reading now states the unit it is computed in; see the note on the definition.
    expect(FUNNELS.listing_to_live.reading).toContain('Sessions in which a created listing reached live');
  });
});

/* ------------------------------------------------------------------ duration */

describe('time to first listing is measured to the last step of the sequence', () => {
  it('one seller: p50 is the published stamp minus the onboarding stamp', () => {
    const result = evaluateFunnel('time_to_first_listing', envelopesOf(SELLER_STREAM));
    expect(result.completed).toBe(1);
    expect(result.duration).toEqual({ p50Ms: 3_540_000, p90Ms: 3_540_000, maxMs: 3_540_000, samples: 1 });
  });

  it('keeping on browsing after publishing does not lengthen the listing', () => {
    const stream: readonly FixtureEvent[] = [...SELLER_STREAM, { name: 'page_view', props: CLEAN_FIXTURES.page_view, at: 40 * 60 * 60 * 1000 }];
    expect(evaluateFunnel('time_to_first_listing', envelopesOf(stream)).duration?.p50Ms).toBe(3_540_000);
  });

  it('three sellers give the nearest-rank percentiles the exit test quotes', () => {
    const cohort = [60_000, 3_540_000, 86_400_000].flatMap((at, i) =>
      envelopesOf(sellerStreamPublishingAt(at), { sessionId: sessionAt(i) }),
    );
    const result = evaluateFunnel('time_to_first_listing', cohort);
    expect(result.sessions).toBe(3);
    expect(result.conversion).toBe(1);
    expect(result.duration).toEqual({ p50Ms: 3_540_000, p90Ms: 86_400_000, maxMs: 86_400_000, samples: 3 });
  });

  it('an empty cohort is null, never a zero that reads as "fast"', () => {
    const result = evaluateFunnel('time_to_first_listing', []);
    expect(result.sessions).toBe(0);
    expect(result.conversion).toBe(null);
    expect(result.duration).toEqual({ p50Ms: null, p90Ms: null, maxMs: null, samples: 0 });
    expect(result.outcomes).toBe(null);
  });

  it('a plain conversion funnel reports no duration, so nobody graphs an empty one', () => {
    expect(evaluateFunnel('listing_to_live', envelopesOf(SELLER_DROP_STREAM)).duration).toBe(null);
    expect(evaluateFunnel('inspection_to_purchase', envelopesOf(SCENE_BUYER_STREAM)).duration).toBe(null);
  });
});

/* ------------------------------------------------------------------ outcome shares */

describe('the R270 availability read is shares over the inspections that were opened', () => {
  it('each stream lands in exactly one outcome bucket', () => {
    expect(availability(STATIC_ONLY_BUYER_STREAM).outcomes).toMatchObject({ total: 1, staticFallback: 1, unavailableShare: 1 });
    expect(availability(SCENE_BUYER_STREAM).outcomes).toMatchObject({ total: 1, sceneRan: 1, unavailableShare: 0 });
    expect(availability(BUDGET_REFUSED_STREAM).outcomes).toMatchObject({ total: 1, budgetRefused: 1, unavailableShare: 1 });
    expect(availability(CONTEXT_LOST_STREAM).outcomes).toMatchObject({ total: 1, contextLost: 1, unavailableShare: 1 });
  });

  it('a scene that mounted and then lost its context is not counted as having run', () => {
    // The telemetry row in that stream carries `scene_ready_ms: null`, which is how "it never came up"
    // survives a scene having been attempted.
    const outcomes = availability(CONTEXT_LOST_STREAM).outcomes;
    expect(outcomes?.sceneRan).toBe(0);
    expect(outcomes?.contextLost).toBe(1);
  });

  it('the four streams add up to one cohort', () => {
    const result = evaluateFunnel('three_d_availability', buyerCohort());
    expect(result.sessions).toBe(4);
    expect(result.outcomes).toEqual({
      sceneRan: 1,
      staticFallback: 1,
      budgetRefused: 1,
      contextLost: 1,
      unresolved: 0,
      total: 4,
      unavailableShare: 0.75,
    });
  });

  it('the availability funnel counts an inspection, not a purchase', () => {
    const result = availability(BUDGET_REFUSED_STREAM);
    // Step 2 accepts any of the four outcomes, so the session "completes" the sequence while buying
    // nothing: `conversion` here means "an outcome was recorded", and the shares are the answer.
    expect(result.completed).toBe(1);
    expect(result.outcomes?.total).toBe(1);
  });

  it('an inspection with no recorded outcome is unresolved, and is not quietly counted as served', () => {
    const blind: readonly FixtureEvent[] = [
      { name: 'inspect_opened', props: { listing_ref: LISTING_REF_A, entry: 'item_page' }, at: 0 },
      { name: 'vital_recorded', props: CLEAN_FIXTURES.vital_recorded, at: 10 },
    ];
    const outcomes = availability(blind).outcomes;
    expect(outcomes).toMatchObject({ total: 1, unresolved: 1, sceneRan: 0 });
    // READ THIS WITH CARE: `unavailableShare` counts only the three *known* failures, so an unresolved
    // inspection lowers the reported share — the optimistic direction. A cohort with many unresolved rows
    // cannot answer R270 at all, which is why `itemsUnresolved` is on the economics type and is asserted
    // here rather than folded away.
    expect(outcomes?.unavailableShare).toBe(0);
  });

  it('no other funnel reports outcomes, so a reviewer cannot mix the two measures', () => {
    expect(evaluateFunnel('inspection_to_purchase', envelopesOf(SCENE_BUYER_STREAM)).outcomes).toBe(null);
    expect(evaluateFunnel('time_to_first_listing', envelopesOf(SELLER_STREAM)).outcomes).toBe(null);
  });
});

/* ------------------------------------------------------------------ the consent cohort */

describe('a session that cannot support the funnel is excluded from every number', () => {
  it('a seller stream has no quality rows, so it cannot answer the 3D question and does not appear', () => {
    const result = availability(SELLER_STREAM);
    expect(result.excludedNoConsent).toBe(1);
    expect(result.sessions).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.conversion).toBe(null);
    expect(result.steps.every((s) => s.reached === 0)).toBe(true);
    expect(result.outcomes).toMatchObject({ total: 0, unavailableShare: 0 });
  });

  it('exclusion is per session: one unqualified cohort member does not pollute the shares', () => {
    const mixed = [...envelopesOf(SELLER_STREAM, { sessionId: sessionAt(0) }), ...buyerCohort()];
    const result = evaluateFunnel('three_d_availability', mixed);
    expect(result.excludedNoConsent).toBe(1);
    expect(result.sessions).toBe(4);
    expect(result.outcomes).toMatchObject({ total: 4, unavailableShare: 0.75 });
  });

  it('the seller and inspection funnels need only measurement, so they exclude nothing', () => {
    const sellerFunnels: readonly FunnelId[] = ['time_to_first_listing', 'listing_to_live'];
    for (const id of sellerFunnels) {
      expect(evaluateFunnel(id, envelopesOf(SELLER_STREAM)).excludedNoConsent).toBe(0);
    }
    expect(evaluateFunnel('inspection_to_purchase', envelopesOf(STATIC_ONLY_BUYER_STREAM)).excludedNoConsent).toBe(0);
  });

  it('essential rows alone are not a cohort', () => {
    const onlyEssential = [envelopeOf({ name: 'consent_recorded', props: CLEAN_FIXTURES.consent_recorded, at: 0 }, { sessionId: sessionAt(0) })];
    const result = evaluateFunnel('three_d_availability', onlyEssential);
    expect(result.excludedNoConsent).toBe(1);
    expect(result.sessions).toBe(0);
  });
});

/* ------------------------------------------------------------------ capture economics */

describe('the R270 money question is answered by a bucket, not a price', () => {
  it('break-even sits on a bucket edge by construction', () => {
    expect(CAPTURE_COST_CENTS).toBe(27_000);
    expect(TAKE_RATE).toBe(0.1);
    expect(BREAK_EVEN_CENTS).toBe(270_000);
    const index = PRICE_BUCKETS.indexOf('2700_5000');
    expect(PRICE_BUCKETS[index - 1]).toBe('2000_2700');
  });

  it('the ladder: four buckets cannot pay at their ceiling, three clear at their floor', () => {
    const rows = bucketEconomics();
    expect(rows.map((r) => r.bucket)).toEqual([...PRICE_BUCKETS]);
    expect(rows.filter((r) => r.viableAtLowerBound).map((r) => r.bucket)).toEqual(['2700_5000', '5000_10000', 'over_10000']);
    expect(rows.filter((r) => r.cannotPayAtUpperBound).map((r) => r.bucket)).toEqual([
      'under_500',
      '500_1000',
      '1000_2000',
      '2000_2700',
    ]);
  });

  it('no bucket straddles the line, so the two flags together answer every bucket', () => {
    // Not a tautology: a bucket with both flags false would have a floor too cheap to pay and a ceiling
    // rich enough to, i.e. an answer that needs the exact price. The exclusive edges were placed on
    // break-even precisely to avoid it, and `straddlingBuckets` is where it would reappear.
    for (const row of bucketEconomics()) expect(row.viableAtLowerBound).toBe(!row.cannotPayAtUpperBound);
    expect(bucketEconomics().filter((r) => !r.viableAtLowerBound && !r.cannotPayAtUpperBound)).toEqual([]);
  });

  it('the break-even bucket has exactly zero headroom at its floor', () => {
    expect(bucketEconomics().find((r) => r.bucket === '2700_5000')).toMatchObject({
      commissionAtLowerBoundCents: CAPTURE_COST_CENTS,
      headroomAtLowerBoundCents: 0,
    });
    expect(bucketEconomics().find((r) => r.bucket === '2000_2700')?.headroomAtLowerBoundCents).toBe(-7_000);
  });

  it('the top bucket has no ceiling, so it is never reported as unable to pay', () => {
    expect(bucketEconomics().at(-1)).toMatchObject({
      bucket: 'over_10000',
      upperCents: null,
      viableAtLowerBound: true,
      cannotPayAtUpperBound: false,
    });
  });

  it('three quarters of inspections unserved writes back three quarters of the capture spend', () => {
    const economics = captureEconomics(evaluateFunnel('three_d_availability', buyerCohort()), {
      '2700_5000': 6,
      '5000_10000': 4,
    });
    expect(economics.itemsWithScene).toBe(1);
    expect(economics.viableBuckets).toEqual(['2700_5000', '5000_10000', 'over_10000']);
    expect(economics.straddlingBuckets).toEqual([]);
    expect(economics.captureCostWastedCents).toBe(10 * CAPTURE_COST_CENTS * 0.75);
    expect(economics.reading).toContain('75 %');
    expect(economics.reading).toContain('no bucket straddles');
  });

  it('a cohort where every scene ran wastes nothing; an empty one says the cost side is unknown', () => {
    const sceneOnly = availability(SCENE_BUYER_STREAM);
    expect(captureEconomics(sceneOnly, { '2700_5000': 10 }).captureCostWastedCents).toBe(0);
    const none = captureEconomics(sceneOnly, {});
    expect(none.captureCostWastedCents).toBe(0);
    expect(none.reading).toContain('cost side is unknown');
  });

  it('an excluded cohort produces a zero share, not a confident one', () => {
    const economics = captureEconomics(availability(SELLER_STREAM), { under_500: 5 });
    expect(economics.itemsUnresolved).toBe(0);
    expect(economics.unavailableShare).toBe(0);
    expect(economics.reading).toContain('0 %');
  });
});
