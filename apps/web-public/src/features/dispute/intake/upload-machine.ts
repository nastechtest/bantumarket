/**
 * Evidence upload, as a state machine an interrupted connection cannot embarrass.
 *
 * Three rules this file is written around, all of them testable and all of them tested in
 * `../evidence.test.tsx`:
 *
 *   1. **Nothing is "uploaded" until the service says so.** `transferEvidence` finishing means the
 *      bytes landed somewhere; `attachEvidence` returning `status: 'attached'` means they are in a
 *      case file a reviewer will open. The machine has a state between those two (`confirming`) and
 *      the UI is not allowed to render the success wording there.
 *   2. **A killed connection is a normal event, not a failure.** Retry with a bounded backoff, reuse
 *      the slot while it is alive, request a fresh one when it expired. A buyer on a taxi with a
 *      dropping signal should end up with an attachment, not with a red X and a lost afternoon.
 *   3. **When it truly will not go, the dispute still goes.** Terminal rejection hands the buyer the
 *      degrade path from `../limits.js` — write it in words — and never blocks submission. A failed
 *      photo that blocks a complaint converts a storage problem into a denied dispute.
 *
 * No timers are hidden in here: `sleep` and `now` are injected so the retry path is tested in
 * milliseconds instead of in real time.
 */

import type { DisputeService, EvidenceDto, EvidenceSlotDto } from '../api/dispute-transport.js';
import { DisputeFailure, isDisputeFailure } from '../api/dispute-transport.js';
import type { EvidenceCandidate } from '../limits.js';
import { checkEvidenceAcceptance, DEGRADE_COPY } from '../limits.js';

export type UploadPhase =
  | 'queued'
  | 'requesting_slot'
  | 'transferring'
  | 'confirming'
  | 'attached'
  | 'interrupted'
  | 'rejected'
  | 'cancelled';

export interface UploadState {
  readonly phase: UploadPhase;
  readonly file: EvidenceCandidate;
  /** Bytes moved so far. Only meaningful in `transferring`; never used to infer completion. */
  readonly sentBytes: number;
  readonly attempt: number;
  readonly slotId: string | null;
  /** The service's own record. Present ONLY once `attachEvidence` has resolved. */
  readonly evidence: EvidenceDto | null;
  readonly message: string | null;
  /** True when the machine gave up and the buyer should be offered the words-instead path. */
  readonly shouldDegrade: boolean;
}

export interface UploadFile {
  readonly localId: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  /** Read by the caller, never stored. Kept out of `UploadState` so no draft or log can carry it. */
  readonly read: () => Promise<Uint8Array>;
}

export interface UploadMachineOptions {
  /** Retries after the first attempt. Bounded: an unbounded retry on a dead connection is a battery
   *  drain that looks like progress. */
  readonly maxRetries?: number;
  readonly backoffMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly nowIso?: () => string;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = [400, 1200, 3000];

export function initialUploadState(file: UploadFile): UploadState {
  return {
    phase: 'queued',
    file: { filename: file.name, mime: file.mime, bytes: file.bytes },
    sentBytes: 0,
    attempt: 0,
    slotId: null,
    evidence: null,
    message: null,
    shouldDegrade: false,
  };
}

/** The one wording the UI may use for `attached` — "in the case file", not "uploaded". */
export function attachedLabel(): string {
  return 'In the case file';
}

export function phaseIsSettledOnService(state: UploadState): boolean {
  return state.phase === 'attached' && state.evidence !== null;
}

/**
 * The invariant, exported so a test can assert it against a whole recorded trace instead of trusting
 * one call site: no state before `attachEvidence` resolves may look like success.
 */
export function traceIsHonest(trace: readonly UploadState[]): boolean {
  const attachIndex = trace.findIndex((s) => s.phase === 'attached');
  if (attachIndex === -1) return true;
  return trace.slice(0, attachIndex).every((s) => s.phase !== 'confirming' || s.evidence === null);
}

function failureKindOf(error: unknown): DisputeFailure['kind'] {
  return isDisputeFailure(error) ? error.kind : 'unknown';
}

function messageFor(kind: DisputeFailure['kind'], file: EvidenceCandidate): string {
  switch (kind) {
    case 'network':
    case 'timeout':
    case 'aborted':
      return `“${file.filename}” did not finish reaching us. We are trying again — it has not been counted as sent.`;
    case 'validation':
      return `“${file.filename}” is something a reviewer cannot open. ${DEGRADE_COPY.body}`;
    case 'conflict':
      return `“${file.filename}” arrived twice. We kept the first copy.`;
    case 'forbidden':
    case 'unauthorized':
      return 'Sign in again to attach evidence. Your statement is safe here in the meantime.';
    case 'rateLimited':
      return `Too many attempts for “${file.filename}”. Wait a minute, then try once more.`;
    case 'notFound':
      return `The upload slot for “${file.filename}” expired before the bytes arrived. Start it again.`;
    case 'unknown':
      return `“${file.filename}” could not be attached. ${DEGRADE_COPY.body}`;
    default:
      return `“${file.filename}” could not be attached.`;
  }
}

/** The four operations an upload needs, and nothing else: a caller that can attach a photo cannot
 *  open, decide or withdraw a dispute with the same object. */
export type UploadService = Pick<
  DisputeService,
  'requestEvidenceSlot' | 'transferEvidence' | 'attachEvidence' | 'abandonEvidenceSlot'
>;

export interface UploadDeps {
  readonly service: UploadService;
  readonly orderId: string;
  readonly disputeId?: string;
  readonly digest?: (bytes: Uint8Array) => Promise<string>;
}

/**
 * Drive one file from `queued` to a settled phase, calling `emit` for every transition. Returns the
 * final state; the caller keeps it in a map keyed by `localId`.
 *
 * The retry loop treats `requesting_slot`, `transferring` and `confirming` as separately fallible:
 * a slot that expired mid-flight is re-requested, a transfer that dies is retried on the live slot,
 * and a failed `attach` (the call that promotes bytes to evidence) is retried without re-sending the
 * bytes — because the bytes are already there, and re-uploading a video over LTE to find that out is
 * exactly the thing this feature is supposed to save somebody.
 */
export async function runUpload(
  deps: UploadDeps,
  file: UploadFile,
  emit: (state: UploadState) => void,
  options: UploadMachineOptions = {},
): Promise<UploadState> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoff = options.backoffMs !== undefined ? [options.backoffMs] : DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let state = initialUploadState(file);
  const publish = (next: UploadState): void => {
    state = next;
    emit(next);
  };

  let body: Uint8Array;
  try {
    body = await file.read();
  } catch {
    publish({ ...state, phase: 'rejected', shouldDegrade: true, message: `We could not read “${file.name}” from this device. ${DEGRADE_COPY.body}` });
    return state;
  }

  const localCheck = checkEvidenceAcceptance([], { filename: file.name, mime: file.mime, bytes: file.bytes });
  if (localCheck !== null) {
    publish({ ...state, phase: 'rejected', shouldDegrade: true, message: `${localCheck.message} ${localCheck.alternative}` });
    return state;
  }

  let digest: string | null = null;
  if (deps.digest !== undefined) {
    try {
      digest = await deps.digest(body);
    } catch {
      digest = null; // no digest primitive on this browser; the service checks on its side
    }
  }

  let slot: EvidenceSlotDto | null = null;
  let bytesSent = false;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      publish({
        ...state,
        phase: 'interrupted',
        attempt,
        sentBytes: 0,
        message: `${messageFor('network', state.file)} Attempt ${attempt + 1} of ${maxRetries + 1}.`,
      });
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 3000);
    }

    if (slot === null) {
      publish({ ...state, phase: 'requesting_slot', attempt });
      try {
        slot = await deps.service.requestEvidenceSlot({
          orderId: deps.orderId,
          ...(deps.disputeId !== undefined ? { disputeId: deps.disputeId } : {}),
          filename: file.name,
          mime: file.mime,
          bytes: file.bytes,
          sha256: digest,
        });
      } catch (error) {
        const kind = failureKindOf(error);
        if (!isDisputeFailure(error) || !error.retryable) {
          publish({ ...state, phase: 'rejected', attempt, shouldDegrade: true, message: messageFor(kind, state.file) });
          return state;
        }
        continue;
      }
    }

    if (!bytesSent) {
      publish({ ...state, phase: 'transferring', attempt, slotId: slot.slotId, sentBytes: 0 });
      try {
        await deps.service.transferEvidence(slot.slotId, body, {
          onProgress: (sent) => {
            // Progress only ever advances inside `transferring`. A `confirming` state that still moves
            // a bar is how a UI implies it knows something the transport has not said.
            if (state.phase === 'transferring') publish({ ...state, sentBytes: sent });
          },
        });
        bytesSent = true;
      } catch (error) {
        const kind = failureKindOf(error);
        if (kind === 'notFound' || kind === 'validation') {
          // Slot died or the file is unacceptable to the store: throw the slot away and re-ask.
          slot = null;
          bytesSent = false;
          continue;
        }
        if (isDisputeFailure(error) && error.retryable) continue;
        publish({ ...state, phase: 'rejected', attempt, shouldDegrade: true, message: messageFor(kind, state.file) });
        return state;
      }
    }

    publish({ ...state, phase: 'confirming', attempt, sentBytes: file.bytes, message: 'The file is with us. Waiting for the case file to accept it.' });
    try {
      const evidence = await deps.service.attachEvidence({ slotId: slot.slotId, sha256: digest });
      if (evidence.status === 'attached') {
        publish({ ...state, phase: 'attached', attempt, evidence, message: null, shouldDegrade: false });
        return state;
      }
      // The service accepted the bytes and then refused them (rejected status). That is terminal for
      // this file and non-terminal for the dispute.
      publish({
        ...state,
        phase: 'rejected',
        attempt,
        evidence: null,
        shouldDegrade: true,
        message: `We had to turn “${file.name}” away (${evidence.rejectionCode ?? 'rejected'}). ${DEGRADE_COPY.body}`,
      });
      return state;
    } catch (error) {
      const kind = failureKindOf(error);
      if (isDisputeFailure(error) && error.retryable) {
        // Bytes are up; only the promotion call failed. Keep the slot and retry the attach, and let
        // `bytesSent` skip the transfer on the next pass — re-uploading a video over LTE to find out
        // the file was already safely stored is the exact waste this branch exists to avoid.
        publish({ ...state, phase: 'interrupted', attempt, message: messageFor(kind, state.file) });
        continue;
      }
      publish({ ...state, phase: 'rejected', attempt, shouldDegrade: true, message: messageFor(kind, state.file) });
      return state;
    }
  }

  // Retries spent. The file is not attached and the buyer needs to know precisely that, not a
  // spinner and not a fake success.
  publish({
    ...state,
    phase: 'rejected',
    shouldDegrade: true,
    message: `“${file.name}” did not reach us after ${maxRetries + 1} attempts. ${DEGRADE_COPY.body}`,
  });
  return state;
}

/** Cancel an in-flight upload and release the slot. Safe to call twice, and safe to call after a
 *  failure — abandoned slots are the reason the type carries an expiry. */
export async function cancelUpload(deps: Pick<UploadDeps, 'service'>, slotId: string | null): Promise<void> {
  if (slotId === null) return;
  try {
    await deps.service.abandonEvidenceSlot(slotId);
  } catch {
    // Nothing the buyer can do about a slot sweep that failed; the expiry handles it.
  }
}
