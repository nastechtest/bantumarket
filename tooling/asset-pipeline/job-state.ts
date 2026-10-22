/**
 * The capture job state machine.
 *
 * State names are imported from `@nastech/api-contracts` (`CaptureJobState`) — they are not
 * re-declared here, because the PHP `media.capture_jobs` DDL and the TS client both read the same
 * vocabulary and a second spelling is how a job ends up "done" in one system and "qc_human" in
 * another.
 *
 * The machine is deliberately narrow. `failed` and `reshot` are reachable from the QC states only:
 * before QC there is nothing to have judged, and letting a job fail from `intake` would give an
 * operator a way to erase a custody trail they had barely started. The consequences of that choice
 * (a seller who walks away at drop-off) are recorded in the brief-09 report rather than patched in
 * by inventing an edge the DDL does not have.
 */

import type { CaptureJobState, ClaimScope, Money } from '@nastech/api-contracts';
import { illegalTransition, inputInvalid } from './errors.js';

/** The linear path. Everything else in the machine is a branch off it. */
export const LINEAR_PATH: readonly CaptureJobState[] = [
  'intake',
  'captured',
  'processed',
  'qc_auto',
  'qc_human',
  'published',
];

export const JOB_STATES: readonly CaptureJobState[] = [...LINEAR_PATH, 'failed', 'reshot'];

export const TERMINAL_STATES: readonly CaptureJobState[] = ['published', 'failed'];

/**
 * Why each forbidden edge is forbidden, in the operator's terms. The reason travels with the
 * rejection: "transition not allowed" without a because is the message that gets worked around.
 */
const BLOCKED_REASONS: Readonly<Partial<Record<CaptureJobState, string>>> = {
  published:
    'A published job is evidence. A re-shoot makes a new asset version under a new job rather than reopening this one.',
  failed:
    'A failed job is closed. The item goes back to the seller against the receipt; a fresh job starts from intake.',
  reshot:
    'A re-shoot only re-enters the pipeline at capture, so the new frames carry their own custody entry.',
};

export const TRANSITIONS: Readonly<Record<CaptureJobState, readonly CaptureJobState[]>> = {
  intake: ['captured'],
  captured: ['processed'],
  processed: ['qc_auto'],
  qc_auto: ['qc_human', 'failed', 'reshot'],
  qc_human: ['published', 'failed', 'reshot'],
  published: [],
  failed: [],
  // The re-shot frames are a capture like any other: they re-enter at `captured` and are judged
  // from scratch. The previous attempt stays in the custody history, it is not overwritten.
  reshot: ['captured'],
};

export type TransitionVerdict = { ok: true } | { ok: false; reason: string };

export function isKnownState(value: string): value is CaptureJobState {
  return (JOB_STATES as readonly string[]).includes(value);
}

export function isTerminal(state: CaptureJobState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

export function canTransition(from: CaptureJobState, to: CaptureJobState): TransitionVerdict {
  if (from === to) {
    return { ok: false, reason: `A job already in "${from}" does not transition to itself; nothing would be recorded.` };
  }
  if ((TRANSITIONS[from] as readonly string[]).includes(to)) return { ok: true };
  const known = TRANSITIONS[from].length === 0
    ? BLOCKED_REASONS[from] ?? `Nothing follows "${from}".`
    : `"${from}" moves only to ${TRANSITIONS[from].map((s) => `"${s}"`).join(' or ')}.`;
  return { ok: false, reason: `${known} Moving to "${to}" would skip the step that produces the evidence "${to}" claims.` };
}

export function assertTransition(from: CaptureJobState, to: CaptureJobState): asserts to {
  const verdict = canTransition(from, to);
  if (!verdict.ok) throw illegalTransition(from, to, verdict.reason);
}

/**
 * Position on the linear path, for progress reporting. `failed` and `reshot` are branches, so they
 * report the depth they branched from rather than pretending to be steps 7 and 8.
 */
export function pathProgress(state: CaptureJobState): { step: number; of: number; label: string } {
  const index = LINEAR_PATH.indexOf(state);
  if (index >= 0) return { step: index + 1, of: LINEAR_PATH.length, label: state };
  if (state === 'reshot') return { step: 2, of: LINEAR_PATH.length, label: 'reshot — back at capture' };
  return { step: LINEAR_PATH.length, of: LINEAR_PATH.length, label: 'failed — closed' };
}

/**
 * The job as the CLI persists it. Fields that a step fills in are `| null` rather than optional:
 * this object round-trips through JSON and the custody log, and "absent" versus "explicitly not
 * measured yet" must survive the trip without a key-presence check at every read.
 */
export interface CaptureJob {
  readonly jobId: string;
  readonly itemId: string;
  readonly listingId: string | null;
  readonly title: string;
  readonly price: Money;
  readonly actor: string;
  readonly state: CaptureJobState;
  readonly receiptCode: string | null;
  readonly assetId: string | null;
  /** A re-shoot never edits an asset version; it opens the next one. */
  readonly assetVersion: number;
  readonly sessionDir: string | null;
  readonly frameCount: number | null;
  readonly metricScaleMetersPerUnit: number | null;
  readonly caseDiameterMm: number | null;
  readonly autoQcVerdict: 'pass' | 'fail' | null;
  readonly humanDecision: 'pass' | 'reshot' | 'fail' | null;
  /** The scope the QC evidence supports, and the scope actually granted. Grant <= support always. */
  readonly scopeSupported: ClaimScope | null;
  readonly scopeGranted: ClaimScope | null;
  /** Who made the scope decision and which custody entry carries it — publish cites both. */
  readonly scopeDecisionActor: string | null;
  readonly scopeDecisionCustodySeq: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewJobInput {
  readonly jobId: string;
  readonly itemId: string;
  readonly listingId: string | null;
  readonly title: string;
  readonly price: Money;
  readonly actor: string;
  readonly receiptCode: string | null;
  readonly assetId: string | null;
  readonly now: string;
}

export function createJob(input: NewJobInput): CaptureJob {
  if (!input.jobId.trim()) throw inputInvalid('A job id is required.', 'Use --job <id> so the custody trail has a key.');
  if (!input.itemId.trim()) throw inputInvalid('An item id is required.', 'The item id is what the receipt and the listing are matched on.');
  if (!input.actor.trim()) throw inputInvalid('An actor is required.', 'Every custody entry names a person; "system" is not a person.');
  return {
    jobId: input.jobId,
    itemId: input.itemId,
    listingId: input.listingId,
    title: input.title,
    price: input.price,
    actor: input.actor,
    state: 'intake',
    receiptCode: input.receiptCode,
    assetId: input.assetId,
    assetVersion: 1,
    sessionDir: null,
    frameCount: null,
    metricScaleMetersPerUnit: null,
    caseDiameterMm: null,
    autoQcVerdict: null,
    humanDecision: null,
    scopeSupported: null,
    scopeGranted: null,
    scopeDecisionActor: null,
    scopeDecisionCustodySeq: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * Move a job. Advancing from `reshot` opens the next asset version, because the frames that follow
 * are a different representation of the item and a dispute has to be able to tell them apart.
 */
export function advance(job: CaptureJob, to: CaptureJobState, now: string): CaptureJob {
  assertTransition(job.state, to);
  const reopenedFromReshoot = job.state === 'reshot' && to === 'captured';
  return {
    ...job,
    state: to,
    assetVersion: reopenedFromReshoot ? job.assetVersion + 1 : job.assetVersion,
    updatedAt: now,
  };
}
