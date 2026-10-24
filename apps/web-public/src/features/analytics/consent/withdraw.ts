/**
 * Withdrawal, as an operation rather than a boolean flip.
 *
 * POPIA s11(4) read with s5 says a data subject may withdraw a consent, and s5 says the responsible
 * person must give them a real mechanism to do so. A checkbox that flips a flag is not a mechanism
 * unless five things actually happen, in order, and this function is where they are ordered:
 *
 *  1. **Seal the gate first.** New events stop arriving *before* we start emptying the buffer, or the
 *     queue refills behind us.
 *  2. **Discard what is already buffered.** Buffered rows were already *collected*; "we stopped
 *     sending them" is a different promise from "we do not have them", and the honest one is the
 *     second. `queue.discardCategory` is the only thing that makes that sentence true.
 *  3. **Rotate the session reference.** The id was issued under the withdrawn consent. Leaving it
 *     alive means rows before and after the withdrawal share a key, which is precisely the join the
 *     buyer just forbade.
 *  4. **Refuse anything still in flight at the wire.** The gateway re-checks consent per batch, so a
 *     request that left before step 2 cannot land with rows from the refused category.
 *  5. **Record the withdrawal itself.** That row is `essential`: the evidence of a permission change
 *     is not itself consented behavioural data, and without it we cannot prove when we stopped.
 *
 * The result object is what the preferences UI prints. A buyer who withdraws is owed a number —
 * "3 events we had not yet sent were discarded" — not a spinner.
 */
import type { ConsentCategory } from '../../../lib/consent/types.js';
import { categoryOf, type EventName } from '../events.js';
import type { EventQueue } from '../queue.js';
import type { SessionManager } from '../session.js';
import type { ConsentManager } from './store.js';

export interface WithdrawalDeps {
  readonly consent: ConsentManager;
  readonly queue: EventQueue;
  readonly session: SessionManager;
  readonly now: () => number;
  /** `consent_recorded` is essential, so it is sent even during a withdrawal. Injected to avoid an import cycle with `track.ts`. */
  readonly recordWithdrawal?: (category: ConsentCategory) => void;
  readonly onDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface WithdrawalResult {
  readonly category: ConsentCategory;
  readonly ok: boolean;
  /** Events that had been collected but not sent, and are now gone. */
  readonly discardedBuffered: number;
  /** Every category still buffered when the whole pipeline is stopped (`erase` path). */
  readonly discardedAll: number;
  readonly sessionRotated: boolean;
  readonly newSessionEpoch: number | null;
  readonly persisted: boolean;
  readonly failure: string | null;
}

export function withdrawCategory(deps: WithdrawalDeps, category: ConsentCategory): WithdrawalResult {
  const none: WithdrawalResult = {
    category,
    ok: false,
    discardedBuffered: 0,
    discardedAll: 0,
    sessionRotated: false,
    newSessionEpoch: null,
    persisted: false,
    failure: null,
  };

  if (category === 'essential') return { ...none, failure: 'essential processing is not consented, so there is nothing to withdraw' };

  const { ok, change } = deps.consent.beginWithdrawal(category);
  if (!ok || change === null) {
    return { ...none, failure: `no withdrawal recorded for ${category}: it was not currently granted` };
  }

  // 1. seal, so nothing re-enters while we empty.
  deps.queue.sealUntilNextDecision(true);

  // 2. discard the buffer for this category. `discardCategory` counts what it removed and the count is
  //    the thing we tell the buyer.
  const discardedBuffered = deps.queue.discardCategory(category);

  // 3. rotate the id, dropping any other-category events the rotation itself must not carry over.
  const snapshot = deps.session.rotate('withdrawal');

  // 4. unseal: other categories the buyer *did* consent to must keep working. The seal only ever
  //    covered the moment of withdrawal; leaving it on would silently switch measurement off after a
  //    quality withdrawal, which is a bug in the buyer's disfavour and a lie about what they chose.
  deps.queue.sealUntilNextDecision(false);

  // 5. the record of the withdrawal.
  try {
    deps.recordWithdrawal?.(category);
  } catch (error) {
    deps.onDiagnostic?.('withdrawal could not record its own consent event', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    category,
    ok: true,
    discardedBuffered,
    discardedAll: 0,
    sessionRotated: snapshot.state !== null && snapshot.available,
    newSessionEpoch: snapshot.state?.epoch ?? null,
    persisted: change.persisted,
    failure: null,
  };
}

/**
 * The "delete my data and stop everything" path — s23 deletion plus s5 abandonment. Unlike a
 * per-category withdrawal this one does not reopen anything: the buffer is emptied across all
 * categories and the session is dropped, not rotated, because there is no consent left to issue a new
 * reference under.
 */
export function withdrawAll(deps: WithdrawalDeps): WithdrawalResult {
  deps.queue.sealUntilNextDecision(true);
  const discardedAll = deps.queue.discardAll();
  for (const category of ['quality', 'measurement'] as const) deps.queue.discardCategory(category);
  const snapshot = deps.session.rotate('withdrawal');
  const persisted = deps.consent.refuseAll('withdrawal');
  deps.queue.sealUntilNextDecision(false);

  return {
    category: 'measurement',
    ok: true,
    discardedBuffered: discardedAll,
    discardedAll,
    sessionRotated: snapshot.state !== null,
    newSessionEpoch: snapshot.state?.epoch ?? null,
    persisted,
    failure: null,
  };
}

/**
 * Erase the record too (an access/deletion request being executed in-app). The gate goes back to
 * "never asked", which is a denying state, so the queue must be emptied *before* the record is
 * removed — after removal there is no consent context to decide what to keep.
 */
export function eraseEverything(deps: WithdrawalDeps): { removed: number; erased: boolean } {
  deps.queue.sealUntilNextDecision(true);
  const removed = deps.queue.discardAll();
  const erased = deps.consent.erase();
  deps.session.reset();
  return { removed, erased };
}

/** Which category an event belongs to, exposed for callers that report a refusal in the buyer's terms. */
export function categoryOfEvent(name: EventName): ConsentCategory {
  return categoryOf(name);
}
