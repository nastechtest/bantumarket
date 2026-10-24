/**
 * The pipeline one call site touches: `track(name, props)`.
 *
 * Order of operations, and why it is in this order:
 *  1. settle any pending session rotation first, so the rotation event itself (which is `essential`
 *     and therefore sendable) is stamped with the *new* reference rather than the one being retired;
 *  2. gate on consent, before anything is validated — an event we are not allowed to collect should
 *     not be able to produce a schema error, and refusing it costs less work than validating it;
 *  3. validate against the closed schema, which is where a PII-shaped value dies;
 *  4. build the envelope, stamping the consent version so the row carries its own basis;
 *  5. push to the queue, which gates once more and then batches.
 *
 * Every rejection returns a reason and increments a counter. A tracking layer that silently drops is
 * indistinguishable from one that never fired, and the difference matters exactly when the exit test
 * numbers come back lower than expected.
 */
import type { ConsentCategory } from '../../lib/consent/types.js';
import { categoryOf, type EventName, type EventPropsMap } from './events.js';
import { gate, type GateReason } from './consent/gates.js';
import { validateProps, type ValidationIssue } from './schema.js';
import type { EventQueue, FlushOutcome } from './queue.js';
import type { RotationReason, SessionManager } from './session.js';
import { sessionAgeBucket } from './session.js';
import type { FirstTouchReader } from './attribution.js';
import type { EventEnvelope, FlushReason } from './transport.js';
import type { ConsentManager } from './consent/store.js';

export type TrackFailure =
  | { readonly kind: 'gate'; readonly reason: GateReason; readonly message: string }
  | { readonly kind: 'schema'; readonly issues: readonly ValidationIssue[] }
  | { readonly kind: 'queue'; readonly reason: 'refused_no_consent' | 'oversize_event' | 'category_unmapped' };

export type TrackResult =
  | { readonly tracked: true; readonly category: ConsentCategory }
  | { readonly tracked: false; readonly failure: TrackFailure };

export interface TrackerStats {
  readonly attempted: number;
  readonly tracked: number;
  readonly gateBlocked: number;
  readonly schemaRejected: number;
  readonly queueRejected: number;
  readonly rotations: number;
  readonly byEvent: Readonly<Record<string, number>>;
  readonly rejectionsByEvent: Readonly<Record<string, number>>;
}

export interface TrackerDeps {
  readonly consent: ConsentManager;
  readonly queue: EventQueue;
  readonly session: SessionManager;
  readonly now: () => number;
  readonly attribution?: FirstTouchReader | null;
  readonly onDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;
  /**
   * In development, a schema rejection is thrown rather than counted. The reason is asymmetric harm:
   * a dropped analytics row in production is a lost number, but a row a developer never learns about
   * is a lost number *and* a bug that ships. `strict` makes it a build-time-feeling failure at the
   * call site while keeping production behaviour fail-soft.
   */
  readonly strict?: boolean;
}

export interface Tracker {
  track<E extends EventName>(name: E, props: EventPropsMap[E]): TrackResult;
  /** Exposed so features can build a correlation ref without reaching into the session manager. */
  refFor(kind: 'listing' | 'order', entityId: string): string | null;
  flush(reason?: FlushReason): Promise<FlushOutcome>;
  /** Emit a pending rotation event. Called by `track` and by the app's consent-change subscription. */
  syncSession(): RotationReason | null;
  stats(): TrackerStats;
  /** For tests: build the exact envelope a call would have produced, without queueing it. */
  preview<E extends EventName>(name: E, props: EventPropsMap[E]): EventEnvelope<E> | null;
}

export function createTracker(deps: TrackerDeps): Tracker {
  const counters = { attempted: 0, tracked: 0, gateBlocked: 0, schemaRejected: 0, queueRejected: 0, rotations: 0 };
  const byEvent: Record<string, number> = {};
  const rejectionsByEvent: Record<string, number> = {};
  const attribution = deps.attribution ?? null;

  const diagnose = (message: string, detail?: Record<string, unknown>): void => {
    try {
      deps.onDiagnostic?.(message, detail);
    } catch {
      /* diagnostics never break tracking */
    }
  };

  function note(name: EventName): void {
    byEvent[name] = (byEvent[name] ?? 0) + 1;
  }

  function noteRejection(name: EventName): void {
    rejectionsByEvent[name] = (rejectionsByEvent[name] ?? 0) + 1;
  }

  function buildEnvelope<E extends EventName>(name: E, props: EventPropsMap[E], state: NonNullable<ReturnType<SessionManager['current']>['state']>): EventEnvelope<E> {
    const category = categoryOf(name);
    const occurredAt = deps.now();
    const record = deps.consent.record();

    const base = {
      name,
      category,
      occurredAt,
      sessionId: state.id,
      sessionEpoch: state.epoch,
      consentVersion: record.version,
      noticeVersion: record.noticeVersion,
      appId: 'web-public' as const,
      props: props as EventPropsMap[E],
    };

    // First-touch rides on the behavioural categories only. Attaching it to `essential` rows would
    // put a marketing-shaped attribution on the legal consent record, which is a purpose mismatch
    // (s16) on the one row that must stay clean.
    const touch = category === 'essential' ? null : attribution?.current() ?? null;
    if (touch !== null) return { ...base, firstTouch: touch };
    return base;
  }

  function emitPendingRotation(): RotationReason | null {
    const reason = deps.session.drainRotation();
    if (reason === null) return null;
    const snapshot = deps.session.current();
    if (snapshot.state === null) return reason;
    counters.rotations += 1;
    const envelope: EventEnvelope<'session_rotated'> = {
      name: 'session_rotated',
      category: 'essential',
      occurredAt: deps.now(),
      sessionId: snapshot.state.id,
      sessionEpoch: snapshot.state.epoch,
      consentVersion: deps.consent.record().version,
      noticeVersion: deps.consent.record().noticeVersion,
      appId: 'web-public',
      props: { reason, session_age_bucket: sessionAgeBucket(deps.session.ageMs()) },
    };
    deps.queue.push(envelope);
    return reason;
  }

  return {
    track(name, props) {
      counters.attempted += 1;
      emitPendingRotation();

      const snapshot = deps.session.current();
      const verdict = gate({
        name,
        consentAllowed: (category) => deps.consent.allowed(category),
        hasDecided: deps.consent.hasDecided(),
        sessionAvailable: snapshot.available,
      });

      if (!verdict.allowed) {
        counters.gateBlocked += 1;
        noteRejection(name);
        // A gate block is a buyer's choice; it is not an error and must not be thrown in strict mode.
        diagnose(verdict.message, { event: name, reason: verdict.reason });
        return { tracked: false, failure: { kind: 'gate', reason: verdict.reason, message: verdict.message } };
      }

      const validation = validateProps(name, props);
      if (!validation.ok) {
        counters.schemaRejected += 1;
        noteRejection(name);
        diagnose(`${name} rejected by schema`, { issues: validation.issues });
        if (deps.strict) {
          throw new Error(
            `analytics schema rejection for ${name}: ${validation.issues.map((i) => `${i.path}: ${i.message}`).join(' | ')}`,
          );
        }
        return { tracked: false, failure: { kind: 'schema', issues: validation.issues } };
      }

      if (snapshot.state === null) {
        // Reachable only when entropy is gone: the gate lets `essential` through, and an essential row
        // with no id is a row with no basis bound to it, so it stops here too.
        counters.queueRejected += 1;
        noteRejection(name);
        diagnose(`${name} dropped: no session reference available`, { category: verdict.category });
        return { tracked: false, failure: { kind: 'queue', reason: 'category_unmapped' } };
      }

      const envelope = buildEnvelope(name, validation.props as EventPropsMap[typeof name], snapshot.state);
      const pushed = deps.queue.push(envelope as EventEnvelope);
      if (!pushed.accepted) {
        counters.queueRejected += 1;
        noteRejection(name);
        return { tracked: false, failure: { kind: 'queue', reason: pushed.reason } };
      }

      counters.tracked += 1;
      note(name);
      return { tracked: true, category: verdict.category };
    },

    preview(name, props) {
      const snapshot = deps.session.current();
      if (snapshot.state === null) return null;
      const validation = validateProps(name, props);
      if (!validation.ok) return null;
      return buildEnvelope(name, validation.props as EventPropsMap[typeof name], snapshot.state) as EventEnvelope< typeof name>;
    },

    refFor(kind, entityId) {
      return deps.session.refFor(kind, entityId);
    },

    flush(reason = 'manual') {
      return deps.queue.flush(reason);
    },

    syncSession() {
      return emitPendingRotation();
    },

    stats() {
      return {
        attempted: counters.attempted,
        tracked: counters.tracked,
        gateBlocked: counters.gateBlocked,
        schemaRejected: counters.schemaRejected,
        queueRejected: counters.queueRejected,
        rotations: counters.rotations,
        byEvent: { ...byEvent },
        rejectionsByEvent: { ...rejectionsByEvent },
      };
    },
  };
}
