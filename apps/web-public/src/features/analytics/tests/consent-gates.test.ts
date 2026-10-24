/**
 * `consent-gates.test.ts` — the POPIA fence, tested from the decision to the wire.
 *
 * Brief 21 requires three specific proofs here, and they are the three a tracking layer can most
 * easily fake:
 *
 *  1. **Nothing is sent before consent.** Not "usually not": every one of the 21 catalogue events is
 *     pushed through the real pipeline and the transport is inspected afterwards.
 *  2. **Nothing is sent to a category that was not granted.** The refusal carries a *reason*, because a
 *     dropped event that reports no reason is indistinguishable from a bug.
 *  3. **Withdrawal stops the queue, including what is already buffered.** The buffered half is the one
 *     an implementation can miss: rows lawfully collected at 10:00 are not lawfully sendable at 10:05,
 *     and "we stopped sending them" has to mean "we do not have them".
 *
 * The transport is `recordingTransport()` from `fixtures.ts` — it records every call and decides
 * nothing — so the assertions are about what left the browser, not about what the gate claimed.
 */
import { describe, expect, it } from 'bun:test';
import { memoryStorage } from '../../../lib/consent/storage.js';
import { DECISION_CATEGORIES, type ConsentCategory } from '../../../lib/consent/types.js';
import { categoryGate, gate, GATED, type GateInput } from '../consent/gates.js';
import { createConsentManager, type ConsentManager } from '../consent/store.js';
import { createQueue, type EventQueue } from '../queue.js';
import { createSessionManager, type SessionManager } from '../session.js';
import { createTracker, type Tracker } from '../track.js';
import { withdrawCategory } from '../consent/withdraw.js';
import { categoryOf, EVENT_NAMES, type EventName } from '../events.js';
import {
  CLEAN_FIXTURES,
  envelopeOf,
  fakeClock,
  nullRandom,
  recordingTransport,
  seededRandom,
  type RecordingTransport,
} from '../fixtures.js';

const ALLOW_ALL = (_category: ConsentCategory): boolean => true;

const ESSENTIAL_NAMES: readonly EventName[] = EVENT_NAMES.filter((name) => categoryOf(name) === 'essential');

function inputFor(name: EventName, over: Partial<GateInput> = {}): GateInput {
  return { name, consentAllowed: ALLOW_ALL, hasDecided: true, sessionAvailable: true, ...over };
}

/** An essential envelope that is legal to hand straight to the queue, for the seal tests. */
function essentialEnvelope() {
  return envelopeOf({ name: 'consent_recorded', props: CLEAN_FIXTURES.consent_recorded, at: 0 });
}

interface Pipeline {
  readonly consent: ConsentManager;
  readonly queue: EventQueue;
  readonly session: SessionManager;
  readonly tracker: Tracker;
  readonly transport: RecordingTransport;
}

interface PipelineOptions {
  /** Categories answered `granted`; every other decision category is answered `refused`. */
  readonly granted?: readonly ConsentCategory[];
  /** False leaves the buyer undecided, which is the "banner never answered" state. */
  readonly decide?: boolean;
  readonly random?: (count: number) => Uint8Array | null;
}

/**
 * The real pipeline: fake clock, fake entropy, a transport that records everything it is sent.
 *
 * A decision is recorded for *every* decision category, because `hasExplicitDecision` counts them —
 * marketing included, since refusing it is the only lawful value it can hold. Leaving it unset would
 * make this fixture an undecided buyer and quietly turn every "refused" assertion into a
 * "not answered yet" assertion.
 */
function pipeline(options: PipelineOptions = {}): Pipeline {
  const granted = options.granted ?? [];
  const clock = fakeClock();
  const transport = recordingTransport();
  const consent = createConsentManager({ storage: memoryStorage(), now: clock.now });
  if (options.decide !== false) {
    for (const category of DECISION_CATEGORIES) {
      consent.setDecision(category, granted.includes(category) ? 'granted' : 'refused', 'banner');
    }
  }
  const session = createSessionManager({ storage: memoryStorage(), random: options.random ?? seededRandom(7), now: clock.now });
  const queue = createQueue({
    transport,
    allowed: categoryGate((category) => consent.allowed(category)),
    now: clock.now,
    // Above the number of events these tests push, so nothing auto-flushes and every send is a choice.
    batchLimitEvents: 50,
  });
  const tracker = createTracker({ consent, queue, session, now: clock.now });
  return { consent, queue, session, tracker, transport };
}

/**
 * Behavioural rows only: the first `track` settles a pending session rotation, which is an essential
 * row and is expected to be there. Buffer assertions that counted it as noise failed for the right
 * reason and the wrong arithmetic.
 */
function buffered(queue: EventQueue, category: ConsentCategory): readonly string[] {
  return queue.buffered().filter((e) => e.category === category).map((e) => e.name);
}

/* ------------------------------------------------------------------ the gate itself */

describe('the gate refuses in a stated order, for a stated reason', () => {
  it('an event with no session reference cannot be collected at all, and that is a developer bug', () => {
    const verdict = gate(inputFor('page_view', { sessionAvailable: false }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('no_session');
    // Actionable because a page that cannot mint a rotating reference is broken — not because the
    // buyer said no. That distinction decides whether anyone looks at it in the morning.
    expect(verdict.actionable).toBe(true);
    expect(verdict.message).toContain('rotating session reference');
  });

  it('no decision yet is a refusal, and it does not blame the developer', () => {
    const verdict = gate(inputFor('listing_viewed', { hasDecided: false }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('no_consent_decision');
    expect(verdict.actionable).toBe(false);
  });

  it('a refused category is refused by name', () => {
    const verdict = gate(inputFor('search_performed', { consentAllowed: () => false }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('category_refused');
    expect(verdict.actionable).toBe(false);
    expect(verdict.message).toContain('measurement is refused');
  });

  it('essential rows ride on their lawful basis, with no session and no decision', () => {
    const verdict = gate(inputFor('consent_recorded', { sessionAvailable: false, hasDecided: false, consentAllowed: () => false }));
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe('allowed');
    expect(verdict.category).toBe('essential');
    expect(verdict.message).toContain('lawful basis');
  });

  it('a withdrawal in flight seals everything except the record of the withdrawal itself', () => {
    const sealed = gate(inputFor('payment_confirmed', { sealed: true }));
    expect(sealed.allowed).toBe(false);
    expect(sealed.reason).toBe('sealed_for_withdrawal');
    expect(sealed.actionable).toBe(true);
    expect(gate(inputFor('consent_recorded', { sealed: true })).allowed).toBe(true);
  });

  it('the checks are ordered, so the reason reported is the first thing that is wrong', () => {
    // sealed before session, session before decision: the buyer's action and the missing basis both
    // outrank "you have not answered the banner yet".
    expect(gate(inputFor('vital_recorded', { sealed: true, sessionAvailable: false, hasDecided: false })).reason).toBe('sealed_for_withdrawal');
    expect(gate(inputFor('vital_recorded', { sessionAvailable: false, hasDecided: false })).reason).toBe('no_session');
    expect(gate(inputFor('vital_recorded', { hasDecided: false })).reason).toBe('no_consent_decision');
  });

  it('every event in the catalogue is collectable once its category is granted', () => {
    const verdicts = EVENT_NAMES.map((name) => gate(inputFor(name)));
    expect(verdicts).toHaveLength(21);
    expect(verdicts.filter((v) => !v.allowed)).toEqual([]);
  });

  it('the gated categories are exactly the ones a buyer can switch off', () => {
    expect([...GATED].sort()).toEqual(DECISION_CATEGORIES.filter((c) => c !== 'marketing').sort());
  });
});

/* ------------------------------------------------------------------ the queue's re-check */

describe('categoryGate is the second, cheaper check the queue runs at flush time', () => {
  it('essential passes without asking, so a decision race cannot lose the legal record', () => {
    expect(categoryGate(() => false)('essential')).toBe(true);
  });

  it('marketing is refused even to a callback that would allow it', () => {
    // The belt-and-braces half of the fence: a bug in the decision store must not be able to open a
    // category the product does not process for.
    expect(categoryGate(() => true)('marketing')).toBe(false);
    expect(categoryGate(() => false)('marketing')).toBe(false);
  });

  it('quality and measurement follow the decision and nothing else', () => {
    const granted = new Set<ConsentCategory>(['quality']);
    const allowed = categoryGate((category) => granted.has(category));
    expect(allowed('quality')).toBe(true);
    expect(allowed('measurement')).toBe(false);
  });
});

/* ------------------------------------------------------------------ nothing before consent */

describe('nothing leaves the browser without consent — proved against a recording transport', () => {
  it('an undecided buyer sends no behavioural event, of any category', async () => {
    const { tracker, queue, transport } = pipeline({ decide: false });
    const behavioural = EVENT_NAMES.filter((name) => categoryOf(name) !== 'essential');
    expect(behavioural).toHaveLength(19);

    for (const name of behavioural) expect(tracker.track(name, CLEAN_FIXTURES[name]).tracked).toBe(false);
    await queue.flush('manual');
    // The batch list is not empty: the very first call settles a pending session rotation, and that
    // row is essential and lawful to send. What must be absent is every behavioural category.
    const sent = transport.batches.flatMap((b) => b.events);
    expect(sent.filter((e) => e.category !== 'essential')).toEqual([]);
    expect(sent.map((e) => e.name)).toEqual(['session_rotated']);
  });

  it('the essential rows still go, because they record the refusal', async () => {
    const { tracker, queue, transport } = pipeline({ decide: false });
    expect(tracker.track('consent_recorded', CLEAN_FIXTURES.consent_recorded).tracked).toBe(true);
    await queue.flush('manual');
    expect(transport.eventNames).toContain('consent_recorded');
    expect(transport.eventNames.filter((n) => !ESSENTIAL_NAMES.includes(n as EventName))).toEqual([]);
    expect(queue.stats().refusedNoConsent).toBe(0);
  });

  it('a buyer who granted quality but refused measurement sends only quality', async () => {
    const { tracker, queue, transport } = pipeline({ granted: ['quality'] });
    expect(tracker.track('vital_recorded', CLEAN_FIXTURES.vital_recorded).tracked).toBe(true);
    const blocked = tracker.track('listing_viewed', CLEAN_FIXTURES.listing_viewed);
    expect(blocked.tracked).toBe(false);
    if (!blocked.tracked) expect(blocked.failure.kind).toBe('gate');

    await queue.flush('manual');
    expect(transport.eventNames).toContain('vital_recorded');
    expect(transport.batchesForCategory('measurement')).toEqual([]);
  });

  it('the gate blocks a bad payload before the schema is consulted', () => {
    // Ordering matters for cost and for honesty: an event we may not collect must not be able to
    // produce a schema error, which would make a buyer's refusal look like a developer's bug.
    const { tracker } = pipeline({ decide: false });
    // Deliberately not a legal bucket: the payload is cast so the compiler cannot pre-judge the test.
    // The point is that the *gate* answers first, and a schema rejection here would mean the refusal
    // was reached only after the invalid value was examined.
    const blocked = tracker.track('payment_confirmed', {
      ...CLEAN_FIXTURES.payment_confirmed,
      amount_bucket: 'nonsense',
    } as unknown as (typeof CLEAN_FIXTURES)['payment_confirmed']);
    expect(blocked.tracked).toBe(false);
    if (!blocked.tracked) expect(blocked.failure.kind).toBe('gate');
    expect(tracker.stats().schemaRejected).toBe(0);
  });

  it('no entropy means nothing is sent at all, essential rows included', () => {
    const clock = fakeClock();
    const consent = createConsentManager({ storage: memoryStorage(), now: clock.now });
    const session = createSessionManager({ storage: memoryStorage(), random: nullRandom(), now: clock.now });
    const transport = recordingTransport();
    const queue = createQueue({ transport, allowed: categoryGate(() => true), now: clock.now, batchLimitEvents: 50 });
    const tracker = createTracker({ consent, queue, session, now: clock.now });

    // The gate's session check stops the behavioural categories; this is the row the gate lets through
    // and the pipeline must still refuse — an event with no reference binds to no consent.
    const essential = tracker.track('consent_recorded', CLEAN_FIXTURES.consent_recorded);
    expect(essential.tracked).toBe(false);
    if (!essential.tracked) expect(essential.failure.kind).toBe('queue');
    expect(queue.size()).toBe(0);
  });
});

/* ------------------------------------------------------------------ withdrawal */

describe('withdrawal stops the queue, including what was already buffered', () => {
  it('buffered rows for the withdrawn category are discarded before they can be sent', async () => {
    const { consent, queue, session, tracker, transport } = pipeline({ granted: ['quality', 'measurement'] });
    tracker.track('listing_viewed', CLEAN_FIXTURES.listing_viewed);
    tracker.track('checkout_started', CLEAN_FIXTURES.checkout_started);
    tracker.track('vital_recorded', CLEAN_FIXTURES.vital_recorded);
    expect(buffered(queue, 'measurement')).toEqual(['listing_viewed', 'checkout_started']);
    expect(buffered(queue, 'quality')).toEqual(['vital_recorded']);

    const result = withdrawCategory({ consent, queue, session, now: () => 1 }, 'measurement');
    expect(result.ok).toBe(true);
    expect(result.discardedBuffered).toBe(2);
    expect(buffered(queue, 'measurement')).toEqual([]);

    await queue.flush('withdrawal');
    expect(transport.eventNames).toContain('vital_recorded');
    expect(transport.batchesForCategory('measurement')).toEqual([]);
  });

  it('the other category keeps working, so one switch off is not the whole product off', async () => {
    const { consent, queue, session, tracker } = pipeline({ granted: ['quality', 'measurement'] });
    withdrawCategory({ consent, queue, session, now: () => 1 }, 'quality');
    expect(tracker.track('search_performed', CLEAN_FIXTURES.search_performed).tracked).toBe(true);
    expect(tracker.track('vital_recorded', CLEAN_FIXTURES.vital_recorded).tracked).toBe(false);
    await queue.flush('manual');
    expect(buffered(queue, 'quality')).toEqual([]);
    expect(queue.size()).toBe(0);
  });

  it('a decision that changes between push and flush drops the row at flush, not at the wire', async () => {
    const clock = fakeClock();
    const transport = recordingTransport();
    const consent = createConsentManager({ storage: memoryStorage(), now: clock.now });
    for (const category of DECISION_CATEGORIES) {
      consent.setDecision(category, category === 'measurement' ? 'granted' : 'refused', 'banner');
    }
    const session = createSessionManager({ storage: memoryStorage(), random: seededRandom(3), now: clock.now });
    const queue = createQueue({ transport, allowed: categoryGate((c) => consent.allowed(c)), now: clock.now, batchLimitEvents: 50 });
    const tracker = createTracker({ consent, queue, session, now: clock.now });

    expect(tracker.track('listing_viewed', CLEAN_FIXTURES.listing_viewed).tracked).toBe(true);
    expect(buffered(queue, 'measurement')).toEqual(['listing_viewed']);

    // A bulk preference change that did not go through `withdrawCategory`: no discard ran, so the row
    // is still sitting in the buffer. The flush-time re-check is the only thing between it and the wire.
    consent.setDecision('measurement', 'refused', 'bulk');
    const outcome = await queue.flush('manual');
    expect(outcome.sent).toBe(0);
    expect(outcome.dropped).toBe(1);
    expect(transport.batches).toEqual([]);
    expect(queue.stats().discardedOnWithdrawal).toBe(1);
  });

  it('the seal refuses even an essential push, and releasing it lets the pipeline run again', () => {
    const { queue } = pipeline({ granted: ['measurement'] });
    expect(queue.push(essentialEnvelope()).accepted).toBe(true);
    queue.sealUntilNextDecision(true);
    expect(queue.push(essentialEnvelope()).accepted).toBe(false);
    queue.sealUntilNextDecision(false);
    expect(queue.push(essentialEnvelope()).accepted).toBe(true);
  });

  it('a withdrawal releases the seal, so measurement is not switched off forever by a quality withdrawal', () => {
    const { consent, queue, session } = pipeline({ granted: ['quality', 'measurement'] });
    withdrawCategory({ consent, queue, session, now: () => 1 }, 'quality');
    // Same envelope, seal-free queue: the only reason a measurement row would fail now is its own consent.
    expect(queue.push(essentialEnvelope()).accepted).toBe(true);
  });

  it('a transport that refuses a batch does not put the rows back for a second attempt', async () => {
    const { queue, tracker, transport } = pipeline({ granted: ['measurement'] });
    tracker.track('listing_viewed', CLEAN_FIXTURES.listing_viewed);
    transport.setNextResult({ ok: false, kind: 'consent_revoked', retryable: false });
    const outcome = await queue.flush('withdrawal');
    expect(outcome.sent).toBe(0);
    // A refused batch that goes back in the buffer is a batch that gets sent later, without a basis.
    expect(buffered(queue, 'measurement')).toEqual([]);
  });
});
