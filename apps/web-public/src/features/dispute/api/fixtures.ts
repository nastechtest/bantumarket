/**
 * The only `DisputeService` in this repo, and it does no I/O.
 *
 * There is no dispute endpoint to talk to (ADR 0002: the PHP backend has no HTTP layer, and the
 * ledger has no `src/Disputes` yet), so a real implementation cannot exist in this wave, and a fake
 * that dressed itself up as one would be worse than none — the screen would look finished while
 * every number in it was scenery. This file is honest in two directions: it is what the dev route
 * and the tests drive, and `FIXTURE_NOTICE` is rendered by the page so nobody mistakes it for a live
 * case. The controller swaps in the generated client when `src/Disputes` lands; the feature only
 * knows this seam.
 *
 * Behaviour it deliberately models, because these are the cases the UI has to get right:
 *   - a transfer that dies mid-stream and a slot that expires (the buyer's connection), which is how
 *     the retry path in `../intake/upload-machine.ts` is tested without a network;
 *   - a clock the service holds: `asOf` advances on every read while `dueAt` stays where the service
 *     put it, so closing the tab cannot buy extra time;
 *   - a refund that is requested and never silently booked, because `REFUND_INITIATED` moves nothing.
 */

import { money } from '@nastech/api-contracts';
import type {
  AttachEvidenceCmd,
  DisputeDto,
  DisputePrincipal,
  DisputeService,
  DisputeState,
  EscalationDto,
  EvidenceDto,
  EvidenceSlotDto,
  OpenDisputeCmd,
  OrderSnapshotDto,
  RequestEvidenceSlotCmd,
  RespondCmd,
  ReturnInstructionDto,
  TimelineEventDto,
} from './dispute-transport.js';
import { DisputeFailure } from './dispute-transport.js';

/** Rendered on the page: the alternative is a buyer believing they are looking at their own case. */
export const FIXTURE_NOTICE = 'Sample case on this device — there is no dispute service running yet.';

const AS_OF = '2026-06-18T09:30:00Z';
const DAY_MS = 86_400_000;

function isoAfter(base: string, days: number): string {
  return new Date(Date.parse(base) + days * DAY_MS).toISOString();
}

export function fixtureOrderSnapshot(orderId = 'ord_01'): OrderSnapshotDto {
  return {
    orderId,
    // A state the real ladder can actually be in with an item already handed over, so the eligible
    // path is exercised against `Order.php`'s vocabulary rather than an invented one.
    status: 'HANDOVER_CONFIRMED',
    buyerId: 'usr_buyer_1',
    sellerId: 'usr_seller_7',
    itemPrice: money(420_000),
    buyerTotal: money(420_000),
    paidAt: '2026-05-30T08:00:00Z',
    handoverConfirmedAt: '2026-06-04T10:15:00Z',
    completedAt: null,
    asOf: AS_OF,
    // // CONTRACT-GAP: the window is the service's policy; see `../eligibility.ts`.
    windowDays: 14,
    openDisputeId: null,
    conditionRecord: {
      listingId: 'lst_01',
      title: 'Seiko “Presage” automatic, 40.5 mm',
      claimScope: 'geometry_and_external_condition',
      captions: [
        {
          disclosureId: 'dis_01',
          disclosureText: 'One hairline at 2 o’clock on the bezel. Visible only under raking light.',
          severity: 'cosmetic',
        },
        {
          disclosureId: 'dis_02',
          disclosureText:
            'Crystal replaced by the previous owner. Not original; no effect on timekeeping claimed by seller, not verified by us.',
          severity: 'unknown',
        },
      ],
    },
  };
}

/** A second snapshot so the closed-window refusal is reachable in dev and in a test without mutating
 *  the first one. */
export function fixtureOrderSnapshotWindowClosed(orderId = 'ord_09'): OrderSnapshotDto {
  return {
    ...fixtureOrderSnapshot(orderId),
    status: 'COMPLETED',
    completedAt: '2026-05-02T09:00:00Z',
    handoverConfirmedAt: '2026-04-28T09:00:00Z',
  };
}

/** Top-level-mutable view of a wire DTO: the store needs to write, the reads must not. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
interface MutableDispute extends Mutable<DisputeDto> {
  timeline: TimelineEventDto[];
  evidence: EvidenceDto[];
}

interface MutableCase {
  dispute: MutableDispute;
  returnInstruction: ReturnInstructionDto | null;
  escalation: EscalationDto | null;
}

interface SlotEntry {
  readonly slot: EvidenceSlotDto;
  readonly disputeId: string | null;
  evidence: EvidenceDto;
  transferred: boolean;
}

export interface FixtureServiceOptions {
  /** Fail the first N transfers with a dead connection. */
  readonly killTransfers?: number;
  /** Refuse the first N slot requests as expired. */
  readonly expireSlots?: number;
  /** Fail the first N attach calls as a timeout — bytes stored, evidence not yet in the file. */
  readonly failAttach?: number;
  readonly principal?: DisputePrincipal;
}

let slotCounter = 0;
let disputeCounter = 0;
let eventCounter = 0;

function addEvent(
  target: MutableDispute,
  kind: TimelineEventDto['kind'],
  actor: 'buyer' | 'seller' | 'service',
  title: string,
  body: string,
  moneyBearing: boolean,
): void {
  eventCounter += 1;
  target.timeline = [
    ...target.timeline,
    { id: `evt_${eventCounter}`, at: target.sla.asOf, actor, kind, title, body, moneyBearing },
  ];
}

function seedCase(reasonCode: string, statement: string): MutableCase {
  disputeCounter += 1;
  const dispute: MutableDispute = {
    id: `dsp_${disputeCounter}`,
    orderId: 'ord_01',
    state: 'under_review',
    openedAt: '2026-06-10T11:00:00Z',
    openedBy: 'buyer',
    reasonCode,
    severity: 'cosmetic',
    statement,
    evidence: [],
    timeline: [
      {
        id: 'evt_seed_1',
        at: '2026-06-10T11:00:00Z',
        actor: 'buyer',
        kind: 'dispute_opened',
        title: 'Dispute opened',
        body: 'The order moved to IN_DISPUTE. Nothing about the money has changed.',
        moneyBearing: false,
      },
      {
        id: 'evt_seed_2',
        at: '2026-06-11T08:05:00Z',
        actor: 'service',
        kind: 'review_started',
        title: 'A reviewer picked this up',
        body: 'They compare your photographs and your account against the listing and the condition record the seller agreed to.',
        moneyBearing: false,
      },
    ],
    sla: {
      dueAt: isoAfter(AS_OF, 5),
      asOf: AS_OF,
      paused: false,
      awaiting: 'service',
      basis: '5 working days from the last thing either party did',
    },
    version: 3,
  };
  return { dispute, returnInstruction: null, escalation: null };
}

const EXTERIOR_STATEMENT =
  'The bezel has a chip at 4 o’clock that is not in the listing photos and is not in the disclosure the seller agreed to. The condition record says one hairline at 2 o’clock, visible only under raking light.';

const FUNCTIONAL_STATEMENT =
  'It loses about six hours a day. I wound it fully on Monday and set it against my phone; by Tuesday it read six hours behind. The listing said serviced and keeping time.';

function awaitingCase(): MutableCase {
  const target = seedCase('keeps_bad_time', FUNCTIONAL_STATEMENT);
  target.dispute.state = 'awaiting_buyer';
  target.dispute.sla = {
    dueAt: isoAfter(AS_OF, 2),
    asOf: AS_OF,
    paused: true,
    pauseReason: 'The clock stops while we wait for your answer.',
    awaiting: 'buyer',
    basis: 'Paused: waiting on you. It resumes when you reply.',
  };
  target.dispute.awaitingYou = {
    kind: 'answer_question',
    instruction:
      'The reviewer has read what you wrote. They need one thing: is the six-hour loss on the wrist, or only when it sits still? Say it in your own words — we cannot hear a movement from here.',
    by: isoAfter(AS_OF, 2),
    refId: 'q_1',
    suggestedEvidence: ['A photo of the time shown against your phone, both in one frame'],
  };
  addEvent(target.dispute, 'question_asked', 'service', 'A question for you', 'What you answer decides which disclosure is compared.', false);
  return target;
}

function outcomeCase(): MutableCase {
  const target = seedCase('damage_not_disclosed', EXTERIOR_STATEMENT);
  target.dispute.state = 'outcome_offered';
  target.dispute.outcome = {
    id: 'out_1',
    kind: 'partial_refund',
    refundToBuyer: money(42_000),
    releaseToSeller: money(378_000),
    commissionReversal: money(4_200),
    returnRequired: false,
    proposedAt: isoAfter(AS_OF, 1),
    explanation:
      'The chip is not covered by the disclosure the seller agreed to, and the rest of the item matches the listing. We propose returning the difference between the item as described and the item as it is. We are not deciding that the seller did anything on purpose.',
    moneyBearing: false,
    booked: false,
    expiresAt: isoAfter(AS_OF, 7),
  };
  target.dispute.awaitingYou = {
    kind: 'respond_to_outcome',
    instruction:
      'Accept or decline. If you accept, a refund is requested — it is not paid at that moment, and this screen will not say that it was.',
    by: isoAfter(AS_OF, 7),
    refId: 'out_1',
  };
  addEvent(target.dispute, 'outcome_offered', 'service', 'A proposal for you', 'Declining sends it back to a person; it does not end the dispute.', false);
  return target;
}

export function createFixtureService(options: FixtureServiceOptions = {}): DisputeService {
  const store = new Map<string, MutableCase>();
  const slots = new Map<string, SlotEntry>();
  const snapshots = new Map<string, OrderSnapshotDto>();

  let killsRemaining = options.killTransfers ?? 0;
  let expiriesRemaining = options.expireSlots ?? 0;
  let attachFailuresRemaining = options.failAttach ?? 0;

  function caseFor(disputeId: string): MutableCase {
    const found = store.get(disputeId);
    if (found === undefined) throw new DisputeFailure('notFound');
    return found;
  }

  function snapshotFor(orderId: string): OrderSnapshotDto {
    const existing = snapshots.get(orderId);
    if (existing !== undefined) return existing;
    const fresh =
      orderId === 'ord_09' ? fixtureOrderSnapshotWindowClosed(orderId) : fixtureOrderSnapshot(orderId);
    snapshots.set(orderId, fresh);
    return fresh;
  }

  /** Every read advances the service's clock and returns copies, so a component cannot write to what
   *  it rendered and so a returning tab sees elapsed time it did not have to sit through. */
  function read(dispute: MutableDispute): DisputeDto {
    const advanced = new Date(Date.parse(dispute.sla.asOf) + 3_600_000).toISOString();
    return {
      ...dispute,
      sla: { ...dispute.sla, asOf: advanced },
      evidence: [...dispute.evidence],
      timeline: [...dispute.timeline],
    };
  }

  return {
    async getOrderSnapshot(orderId) {
      const snapshot = snapshotFor(orderId);
      const open = [...store.values()].find(
        (c) => c.dispute.orderId === orderId && c.dispute.state !== 'withdrawn',
      );
      return { ...snapshot, openDisputeId: open?.dispute.id ?? null };
    },

    async getDispute(disputeId) {
      return read(caseFor(disputeId).dispute);
    },

    async openDispute(cmd: OpenDisputeCmd) {
      if (cmd.statement.trim().length < 40) throw new DisputeFailure('validation');
      const target = seedCase(cmd.reasonCode, cmd.statement);
      target.dispute.openedAt = AS_OF;
      target.dispute.openedBy = cmd.actor;
      target.dispute.severity = cmd.severity;
      target.dispute.state = 'open';
      target.dispute.evidence = attachedEvidence(cmd.attachedEvidenceIds);
      addEvent(target.dispute, 'dispute_opened', cmd.actor, 'Dispute opened', 'The order moved to IN_DISPUTE. No money has moved.', false);
      store.set(target.dispute.id, target);
      const snapshot = snapshotFor(cmd.orderId);
      snapshots.set(cmd.orderId, { ...snapshot, status: 'IN_DISPUTE', openDisputeId: target.dispute.id });
      return read(target.dispute);
    },

    async amendStatement({ disputeId, statement, version }) {
      const target = caseFor(disputeId);
      if (version !== target.dispute.version) throw new DisputeFailure('conflict', { staleRead: true });
      addEvent(target.dispute, 'statement_amended', 'buyer', 'Your written account was updated', 'The reviewer reads the latest version; earlier ones stay in the file.', false);
      target.dispute.statement = statement;
      target.dispute.version += 1;
      return read(target.dispute);
    },

    async requestEvidenceSlot(cmd: RequestEvidenceSlotCmd) {
      if (expiriesRemaining > 0) {
        expiriesRemaining -= 1;
        throw new DisputeFailure('notFound');
      }
      slotCounter += 1;
      const slotId = `slot_${slotCounter}`;
      const slot: EvidenceSlotDto = {
        slotId,
        filename: cmd.filename,
        mime: cmd.mime,
        bytes: cmd.bytes,
        expiresAt: isoAfter(AS_OF, 1),
        transferRef: `transfer_${slotCounter}`,
      };
      slots.set(slotId, {
        slot,
        disputeId: cmd.disputeId ?? null,
        transferred: false,
        evidence: {
          id: `evd_${slotCounter}`,
          filename: cmd.filename,
          mime: cmd.mime,
          bytes: cmd.bytes,
          sha256: cmd.sha256,
          status: 'requested',
          uploadedBy: options.principal?.actor ?? 'buyer',
          attachedAt: null,
        },
      });
      return slot;
    },

    async transferEvidence(slotId, body, opts) {
      const entry = slots.get(slotId);
      if (entry === undefined) throw new DisputeFailure('notFound');
      if (killsRemaining > 0) {
        killsRemaining -= 1;
        // A connection that dies mid-stream: progress stops where it stopped, and the file is left as
        // nothing until a retry says otherwise.
        opts?.onProgress?.(Math.floor(body.byteLength / 3), body.byteLength);
        throw new DisputeFailure('network');
      }
      opts?.onProgress?.(body.byteLength, body.byteLength);
      entry.transferred = true;
      entry.evidence = { ...entry.evidence, status: 'transferred' };
    },

    async attachEvidence(cmd: AttachEvidenceCmd): Promise<EvidenceDto> {
      const entry = slots.get(cmd.slotId);
      if (entry === undefined) throw new DisputeFailure('notFound');
      if (!entry.transferred) throw new DisputeFailure('validation');
      if (attachFailuresRemaining > 0) {
        attachFailuresRemaining -= 1;
        throw new DisputeFailure('timeout');
      }
      const attached: EvidenceDto = { ...entry.evidence, status: 'attached', attachedAt: AS_OF };
      entry.evidence = attached;
      // A slot raised before any dispute existed has no case file to enter yet; that is a real state,
      // and inventing one would be the phantom attachment this file refuses to make.
      if (entry.disputeId !== null) {
        const target = store.get(entry.disputeId);
        if (target !== undefined) {
          target.dispute.evidence = [...target.dispute.evidence, attached];
          addEvent(target.dispute, 'evidence_attached', 'buyer', 'Evidence added', `“${attached.filename}” is in the case file.`, false);
        }
      }
      return attached;
    },

    async abandonEvidenceSlot(slotId) {
      slots.delete(slotId);
    },

    async respondToDispute(cmd: RespondCmd) {
      const target = caseFor(cmd.disputeId);
      if (cmd.message.trim().length === 0) throw new DisputeFailure('validation');
      addEvent(target.dispute, 'response_given', cmd.actor, 'You replied', 'The clock starts again from today.', false);
      target.dispute.state = 'under_review';
      target.dispute.version += 1;
      target.dispute.awaitingYou = undefined;
      target.dispute.sla = {
        dueAt: isoAfter(AS_OF, 5),
        asOf: AS_OF,
        paused: false,
        awaiting: 'service',
        basis: '5 working days from your reply',
      };
      return read(target.dispute);
    },

    async acceptOutcome({ disputeId, outcomeId }) {
      const target = caseFor(disputeId);
      const outcome = target.dispute.outcome;
      if (outcome === undefined || outcome.id !== outcomeId) throw new DisputeFailure('validation');
      if (target.dispute.state !== 'outcome_offered') throw new DisputeFailure('conflict', { staleRead: true });
      target.dispute.outcome = { ...outcome, acceptedBy: 'buyer' };
      target.dispute.awaitingYou = undefined;
      target.dispute.state = 'outcome_accepted';
      target.dispute.version += 1;
      // `booked` stays false: acceptance raises `REFUND_INITIATED`, which moves nothing. Only
      // `REFUND_SETTLED` books it, and no fixture gets to fake that.
      addEvent(target.dispute, 'refund_requested', 'service', 'Refund requested', 'A refund has been requested. It has not reached your account.', false);
      return read(target.dispute);
    },

    async declineOutcome({ disputeId, outcomeId, actor }) {
      const target = caseFor(disputeId);
      if (target.dispute.outcome?.id !== outcomeId) throw new DisputeFailure('validation');
      addEvent(target.dispute, 'outcome_declined', actor, 'You declined the proposal', 'The case goes back to a person. Declining does not end the dispute.', false);
      target.dispute.awaitingYou = undefined;
      target.dispute.state = 'under_review';
      target.dispute.version += 1;
      return read(target.dispute);
    },

    async requestReturn({ disputeId, method }) {
      const target = caseFor(disputeId);
      const instruction: ReturnInstructionDto = {
        disputeId,
        method,
        issuedAt: AS_OF,
        instructions:
          method === 'collect'
            ? 'A courier will call you to arrange a collection. Nothing has been booked for you yet, so no date is promised here.'
            : 'Post it registered, insured for the sale price, and keep the slip — the slip is the evidence that it left your hands.',
        scheduledFor: null,
        trackingRef: null,
      };
      target.returnInstruction = instruction;
      target.dispute.returnInstruction = instruction;
      addEvent(target.dispute, 'return_requested', target.dispute.openedBy, 'Return started', 'The item has to come back before a refund can be settled.', false);
      target.dispute.state = 'under_review';
      return instruction;
    },

    async confirmReturnReceived({ disputeId }) {
      const target = caseFor(disputeId);
      if (target.returnInstruction === null) throw new DisputeFailure('validation');
      addEvent(target.dispute, 'return_received', 'seller', 'Seller says the item is back', 'A reviewer still has to open the file; this is the seller’s word, recorded as such.', false);
      return read(target.dispute);
    },

    async escalate(cmd) {
      const target = caseFor(cmd.disputeId);
      const escalation: EscalationDto = {
        disputeId: cmd.disputeId,
        escalatedAt: AS_OF,
        ref: `ESC-${cmd.disputeId}`,
        outsidePlatformScope: ['How it keeps time', 'Whether it holds water', 'Whether it is genuine'],
        whatHappensNext:
          'A senior reviewer reads the record again — the listing, the disclosure, your photographs and your words. They cannot test the movement either, and this screen will not imply that a second pair of eyes is a bench.',
      };
      target.escalation = escalation;
      addEvent(target.dispute, 'escalated', cmd.actor, 'Asked for a second look', 'Your note is attached to the case file.', false);
      target.dispute.state = 'escalated';
      return escalation;
    },

    async withdraw({ disputeId }) {
      const target = caseFor(disputeId);
      if (target.dispute.state === 'outcome_offered') throw new DisputeFailure('conflict', { staleRead: true });
      addEvent(target.dispute, 'withdrawn', 'buyer', 'Dispute withdrawn', 'The case file is closed.', false);
      target.dispute.state = 'withdrawn';
      return read(target.dispute);
    },
  };

  function attachedEvidence(slotIds: readonly string[]): EvidenceDto[] {
    const out: EvidenceDto[] = [];
    for (const slotId of slotIds) {
      const entry = slots.get(slotId);
      if (entry !== undefined && entry.evidence.status === 'attached') out.push(entry.evidence);
    }
    return out;
  }
}

/** Pre-seeded reads, for the dev route's "show me the other states" switch and for tests that need a
 *  state without walking the write path into it. */
export function fixtureDispute(which: 'under_review' | 'awaiting_buyer' | 'outcome_offered'): DisputeDto {
  const target: MutableCase =
    which === 'awaiting_buyer' ? awaitingCase() : which === 'outcome_offered' ? outcomeCase() : seedCase('damage_not_disclosed', EXTERIOR_STATEMENT);
  const dispute = target.dispute;
  if (which === 'under_review') {
    dispute.evidence = [
      {
        id: 'evd_seed',
        filename: 'bezel-daylight.jpg',
        mime: 'image/jpeg',
        bytes: 1_480_000,
        sha256: null,
        status: 'attached',
        uploadedBy: 'buyer',
        attachedAt: '2026-06-10T11:12:00Z',
      },
    ];
  }
  return { ...dispute, evidence: [...dispute.evidence], timeline: [...dispute.timeline] };
}

/** The state names a reviewer-facing label is rendered for; exported so the timeline and the tests
 *  cannot drift apart on wording. */
export const DISPUTE_STATE_LABELS: Readonly<Record<DisputeState, string>> = {
  open: 'Opened, not yet read',
  under_review: 'Being read by a reviewer',
  awaiting_buyer: 'Waiting for you',
  awaiting_seller: 'Waiting for the seller',
  escalated: 'With a senior reviewer',
  outcome_offered: 'A proposal is on the table',
  outcome_accepted: 'Accepted — refund requested',
  closed_for_seller: 'Closed against you',
  withdrawn: 'Withdrawn by you',
};
