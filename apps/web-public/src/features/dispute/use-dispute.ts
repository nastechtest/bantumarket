/**
 * The dispute screen's controller: the effects that talk to the service, and the one object the page
 * renders from.
 *
 * The state machines live beside this file — `intake-state.ts` for what the buyer is typing,
 * `dispute-model.ts` for what the service said and the phase derived from it, `send-gate.ts` for why
 * send is disabled, `dispute-intents.ts` for idempotency keys — so what remains here is the wiring:
 * React hooks, service calls, and failure handling.
 *
 * Two properties the wiring is arranged around.
 *
 * **Nothing is claimed before the service says it.** Sending a dispute into a dead connection
 * produces `send_unconfirmed`, whose only job is to say "we do not know whether this reached us". It
 * keeps that intent's idempotency key, so a second press cannot open two disputes if the first did
 * land, and it never renders the tracking view until an actual `DisputeDto` comes back. Same
 * discipline as the upload machine, same reason: the alternative is a buyer who believes a case
 * exists that does not.
 *
 * **The clock is never the browser's.** Every date a buyer is shown comes from the service read
 * (`asOf`), and `derivePhase` takes the model rather than calling `Date.now()`. The only place this
 * file reads the device clock is the draft stamp, which is labelled as device-local because it is.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  DisputeDto,
  DisputePrincipal,
  DisputeService,
  DisputeSeverity,
  EvidenceDto,
} from './api/dispute-transport.js';
import { failureFromUnknown } from './api/dispute-transport.js';
import { assessEligibility } from './eligibility.js';
import type { UploadFile } from './intake/upload-machine.js';
import { cancelUpload, initialUploadState, runUpload } from './intake/upload-machine.js';
import type { KVStorage } from './draft-persistence.js';
import { clearDraft, loadDraft, saveDraft } from './draft-persistence.js';
import type { IntakeState, IntakeStep } from './intake-state.js';
import { initialIntakeState, intakeReducer } from './intake-state.js';
import type { DisputeModel, PagePhase } from './dispute-model.js';
import { derivePhase, initialModel, modelReducer } from './dispute-model.js';
import type { SendGate } from './send-gate.js';
import { sendGate } from './send-gate.js';
import { DisputeIntents } from './dispute-intents.js';

/** `/dispute/ord_01` → `ord_01`. The router hands a feature its route definition, not the params, so
 *  the path is parsed here instead of reaching into a router this feature does not own. */
export function orderIdFromPathname(pathname: string): string | null {
  const parts = pathname.split('/').filter((p) => p.length > 0);
  const index = parts.indexOf('dispute');
  if (index === -1) return null;
  const candidate = parts[index + 1];
  if (candidate === undefined || candidate.length === 0) return null;
  return decodeURIComponent(candidate);
}

export interface UseDisputeArgs {
  readonly service: DisputeService;
  readonly principal: DisputePrincipal | null;
  readonly orderId: string;
  readonly storage?: KVStorage | null;
  readonly digest?: (bytes: Uint8Array) => Promise<string>;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface DisputeViewModel {
  readonly model: DisputeModel;
  readonly phase: PagePhase;
  readonly intake: IntakeState;
  readonly busy: boolean;
  readonly attachedEvidence: readonly EvidenceDto[];
  readonly gate: SendGate;
  readonly actions: DisputeActions;
}

export interface DisputeActions {
  readonly reload: () => void;
  readonly goStep: (step: IntakeStep) => void;
  readonly pickReason: (code: string) => void;
  readonly pickSeverity: (value: DisputeSeverity) => void;
  readonly setStatement: (value: string) => void;
  readonly addFile: (file: UploadFile) => void;
  readonly retryUpload: (localId: string) => void;
  readonly removeUpload: (localId: string) => void;
  readonly acknowledgeRights: (value: boolean) => void;
  readonly restoreDraft: () => void;
  readonly discardDraft: () => void;
  readonly send: () => void;
  readonly respond: (message: string) => void;
  readonly acceptOutcome: (outcomeId: string) => void;
  readonly declineOutcome: (outcomeId: string) => void;
  readonly requestReturn: (method: 'collect' | 'post' | 'meet') => void;
  readonly confirmReturnReceived: () => void;
  readonly escalate: (note: string) => void;
}

export function useDispute(args: UseDisputeArgs): DisputeViewModel {
  const { service, principal, orderId } = args;
  const [model, dispatchModel] = useReducer(modelReducer, initialModel);
  const [intake, dispatch] = useReducer(intakeReducer, undefined, initialIntakeState);
  const [busy, setBusy] = useState(false);
  const intents = useRef<DisputeIntents>(new DisputeIntents()).current;
  const storeRef = useRef<KVStorage | null>(args.storage ?? null);
  /** Bytes are never persisted, so a retry after a page reload has nothing to re-send and says so
   *  rather than silently uploading a different file the buyer picked in the meantime. */
  const fileRegistry = useRef(new Map<string, UploadFile>()).current;

  const load = useCallback(async (): Promise<void> => {
    dispatchModel({ type: 'loading' });
    if (principal === null) {
      dispatchModel({ type: 'needs_sign_in' });
      return;
    }
    try {
      const snapshot = await service.getOrderSnapshot(orderId, principal.actor);
      const verdict = assessEligibility({ snapshot, actorUserId: principal.userId, actorRole: principal.actor });
      if (!verdict.canOpen) {
        if (verdict.code === 'already_open' && verdict.openDisputeId !== null) {
          const dispute = await service.getDispute(verdict.openDisputeId, principal.actor);
          dispatchModel({ type: 'loaded', snapshot, verdict, dispute });
          return;
        }
        dispatchModel({ type: 'loaded', snapshot, verdict, dispute: null });
        return;
      }
      dispatchModel({ type: 'loaded', snapshot, verdict, dispute: null });
      const stored = loadDraft(storeRef.current, orderId);
      if (stored !== null) dispatch({ type: 'draft_found', savedAt: stored.savedAt });
    } catch (error) {
      dispatchModel({ type: 'read_failed', failure: failureFromUnknown(error) });
    }
  }, [service, principal, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Autosave. A keystroke must not write to storage sixty times a minute, and a draft that never
  // lands is only a lost paragraph — so one write per quiet second.
  const intakeKey = `${intake.reasonCode}|${intake.severity}|${intake.step}|${intake.readRightsAcknowledged}|${intake.statement.length}`;
  useEffect(() => {
    if (model.snapshot === null || model.verdict?.canOpen !== true) return;
    if (intake.reasonCode === null && intake.statement.length === 0) return;
    const timer = setTimeout(() => {
      const result = saveDraft(storeRef.current, {
        version: 1,
        orderId,
        reasonCode: intake.reasonCode,
        severity: intake.severity,
        statement: intake.statement,
        step: intake.step,
        readRightsAcknowledged: intake.readRightsAcknowledged,
        savedAt: new Date().toISOString(),
      });
      if (result === 'no_storage') {
        dispatchModel({ type: 'notice', message: 'This browser will not keep a draft. What you type stays on this page only, and is lost if you leave.' });
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [intakeKey, intake.reasonCode, intake.severity, intake.statement, intake.step, intake.readRightsAcknowledged, orderId, model.snapshot, model.verdict]);

  const startUpload = useCallback(
    async (file: UploadFile): Promise<void> => {
      fileRegistry.set(file.localId, file);
      const disputeId = model.dispute?.id;
      dispatch({ type: 'upload', localId: file.localId, state: initialUploadState(file) });
      await runUpload(
        {
          service,
          orderId,
          ...(disputeId !== undefined ? { disputeId } : {}),
          ...(args.digest !== undefined ? { digest: args.digest } : {}),
        },
        file,
        (state) => dispatch({ type: 'upload', localId: file.localId, state }),
        { ...(args.sleep !== undefined ? { sleep: args.sleep } : {}) },
      );
    },
    [service, orderId, args.digest, args.sleep, model.dispute?.id, fileRegistry],
  );

  const attachedEvidence = useMemo<readonly EvidenceDto[]>(() => {
    const fromMachine = Object.values(intake.uploads)
      .filter((u) => u.phase === 'attached' && u.evidence !== null)
      .map((u) => u.evidence as EvidenceDto);
    const fromService = model.dispute?.evidence.filter((e) => e.status === 'attached') ?? [];
    const ids = new Set(fromService.map((e) => e.id));
    return [...fromService, ...fromMachine.filter((e) => !ids.has(e.id))];
  }, [intake.uploads, model.dispute]);

  const gate = useMemo(
    () =>
      sendGate({
        reasonCode: intake.reasonCode,
        severity: intake.severity,
        statement: intake.statement,
        readRightsAcknowledged: intake.readRightsAcknowledged,
      }),
    [intake],
  );

  const send = useCallback(async (): Promise<void> => {
    if (principal === null || !gate.ok || intake.reasonCode === null || intake.severity === null) return;
    const intent = `open:${orderId}:${intake.reasonCode}`;
    setBusy(true);
    try {
      const dispute = await service.openDispute({
        orderId,
        actor: principal.actor,
        reasonCode: intake.reasonCode,
        severity: intake.severity,
        statement: intake.statement,
        attachedEvidenceIds: Object.keys(intake.uploads).filter((id) => intake.uploads[id]?.phase === 'attached'),
        idempotencyKey: intents.keyFor(intent),
      });
      clearDraft(storeRef.current, orderId);
      intents.release(intent);
      dispatchModel({ type: 'sent', dispute });
      dispatchModel({
        type: 'notice',
        message: 'The dispute is open and the order is now IN_DISPUTE. No money has moved, and nothing here says it has.',
      });
    } catch (error) {
      const failure = failureFromUnknown(error);
      if (failure.retryable) {
        // Keep the key: the next press is the same intent, and two disputes on one order is a worse
        // outcome for everyone than a buyer pressing send twice.
        dispatchModel({ type: 'send_unconfirmed', failure });
      } else {
        intents.release(intent);
        dispatchModel({ type: 'notice', message: failure.message });
      }
    }
    setBusy(false);
  }, [principal, gate.ok, intake, orderId, service, intents]);

  /** One wrapper for the tracking-side writes: busy flag, stale-read recovery, honest notice copy. */
  const actOnDispute = useCallback(
    async (intent: string, run: (disputeId: string) => Promise<DisputeDto>): Promise<void> => {
      const disputeId = model.dispute?.id;
      if (disputeId === undefined || principal === null) return;
      setBusy(true);
      try {
        const updated = await run(disputeId);
        intents.release(intent);
        dispatchModel({ type: 'dispute_updated', dispute: updated });
      } catch (error) {
        const failure = failureFromUnknown(error);
        if (failure.staleRead) {
          // The case moved while this screen sat open. Re-read rather than let a buyer believe their
          // click did nothing.
          const fresh = await service.getDispute(disputeId, principal.actor).catch(() => null);
          if (fresh !== null) dispatchModel({ type: 'dispute_updated', dispute: fresh });
        }
        dispatchModel({ type: 'notice', message: failure.message });
        if (!failure.retryable) intents.release(intent);
      }
      setBusy(false);
    },
    [model.dispute?.id, principal, service, intents],
  );

  const actions = useMemo<DisputeActions>(
    () => ({
      reload: () => void load(),
      goStep: (step) => dispatch({ type: 'step', step }),
      pickReason: (code) => dispatch({ type: 'reason', code }),
      pickSeverity: (value) => dispatch({ type: 'severity', value }),
      setStatement: (value) => dispatch({ type: 'statement', value }),
      addFile: (file) => void startUpload(file),
      retryUpload: (localId) => {
        const file = fileRegistry.get(localId);
        if (file === undefined) {
          dispatchModel({
            type: 'notice',
            message: 'That file is no longer on this page — the browser let go of it when the tab closed. Choose it again, or describe it in your statement.',
          });
          return;
        }
        void startUpload(file);
      },
      removeUpload: (localId) => {
        const existing = intake.uploads[localId];
        if (existing !== undefined && existing.slotId !== null) void cancelUpload({ service }, existing.slotId);
        fileRegistry.delete(localId);
        dispatch({ type: 'upload_removed', localId });
      },
      acknowledgeRights: (value) => dispatch({ type: 'acknowledge', value }),
      restoreDraft: () => {
        const stored = loadDraft(storeRef.current, orderId);
        if (stored === null) {
          dispatchModel({ type: 'notice', message: 'The draft is not on this device any more.' });
          return;
        }
        dispatch({ type: 'restore_draft', draft: stored, adoptStep: true });
      },
      discardDraft: () => {
        clearDraft(storeRef.current, orderId);
        dispatch({ type: 'draft_dismissed' });
        dispatch({ type: 'reset' });
        dispatchModel({ type: 'notice', message: 'The draft on this device was deleted. Nothing was sent to NasTech.' });
      },
      send: () => void send(),
      respond: (message) => {
        if (principal === null) return;
        void actOnDispute(`respond:${orderId}:${message.length}`, (id) =>
          service.respondToDispute({
            disputeId: id,
            actor: principal.actor,
            message,
            addedEvidenceIds: attachedEvidence.map((e) => e.id),
            idempotencyKey: intents.keyFor(`respond:${id}:${message.length}`),
          }),
        );
      },
      acceptOutcome: (outcomeId) => {
        if (principal === null) return;
        void actOnDispute(`accept:${orderId}:${outcomeId}`, (id) =>
          service.acceptOutcome({
            disputeId: id,
            outcomeId,
            actor: principal.actor,
            idempotencyKey: intents.keyFor(`accept:${id}:${outcomeId}`),
          }),
        );
      },
      declineOutcome: (outcomeId) => {
        if (principal === null) return;
        void actOnDispute(`decline:${orderId}:${outcomeId}`, (id) =>
          service.declineOutcome({
            disputeId: id,
            outcomeId,
            actor: principal.actor,
            idempotencyKey: intents.keyFor(`decline:${id}:${outcomeId}`),
          }),
        );
      },
      requestReturn: (method) => {
        if (principal === null) return;
        void actOnDispute(`return:${orderId}:${method}`, async (id) => {
          await service.requestReturn({ disputeId: id, actor: principal.actor, method });
          return service.getDispute(id, principal.actor);
        });
      },
      confirmReturnReceived: () => {
        if (principal === null) return;
        void actOnDispute(`confirm-return:${orderId}`, (id) =>
          service.confirmReturnReceived({
            disputeId: id,
            actor: principal.actor,
            idempotencyKey: intents.keyFor(`confirm-return:${id}`),
          }),
        );
      },
      escalate: (note) => {
        if (principal === null) return;
        void actOnDispute(`escalate:${orderId}:${note.length}`, async (id) => {
          await service.escalate({
            disputeId: id,
            actor: principal.actor,
            note,
            idempotencyKey: intents.keyFor(`escalate:${id}:${note.length}`),
          });
          return service.getDispute(id, principal.actor);
        });
      },
    }),
    [load, startUpload, intake.uploads, send, actOnDispute, attachedEvidence, service, intents, orderId, principal],
  );

  return {
    model,
    phase: derivePhase(model),
    intake,
    busy,
    attachedEvidence,
    gate,
    actions,
  };
}
