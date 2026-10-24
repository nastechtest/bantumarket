/**
 * The dispute seam, defined locally and on purpose.
 *
 * There is NO Disputes module in the PHP ledger yet (`../nastech-market-php/src` has Orders,
 * Handover, Payments, Commissions, Settlements — no Disputes), so nobody can tell me the wire shape.
 * A sibling agent is writing `src/Disputes` against the same facts from the other side, and if I
 * invent JSON it will not match theirs. So everything below is declared as an *interface I need*,
 * every assumed endpoint is marked `// CONTRACT-GAP:` for the controller to reconcile, and each
 * operation states the transition it implies in the ladder the ledger already owns
 * (`AWAITING_PAYMENT → PAID → HANDOVER_SCHEDULED → HANDOVER_CONFIRMED → COMPLETED`, plus the
 * refund/dispute side states). Nothing in this file performs I/O: there is no fetch here, and the
 * only implementation in the repo is `./fixtures.ts`.
 *
 * Two naming rules held throughout:
 *   - `OrderStatus` is imported from `@nastech/api-client`, never re-declared: the ladder is
 *     transcribed from `Order.php` there and a local copy is how wrong state names get into a UI.
 *   - `DisputeSeverity` is read out of `ConditionCaption['severity']` in `@nastech/api-contracts`,
 *     because the dispute process reads the disclosure record and a second severity vocabulary would
 *     quietly stop those two from joining.
 */

import type { ClaimScope, ConditionCaption, Money } from '@nastech/api-contracts';
import type { OrderStatus } from '@nastech/api-client';

/** Who is looking. The ledger derives the actor from the principal; the UI still needs to know
 *  which side it is speaking for, because "awaiting you" means the opposite thing to each party. */
export type DisputeRole = 'buyer' | 'seller';

/** Same three values the condition captions carry. Not a dispute-specific invention. */
export type DisputeSeverity = ConditionCaption['severity'];

/**
 * The dispute's own state, distinct from the order's.
 * // CONTRACT-GAP: assumed `dispute_state` column on `src/Disputes/Dispute.php`. `outcome_offered`
 * // is the only state whose name a buyer reads as "decided", so it must not be collapsed into
 * // `closed_for_seller`: an offer is a proposal, and the money has not moved in either of them.
 */
export type DisputeState =
  | 'open'
  | 'under_review'
  | 'awaiting_buyer'
  | 'awaiting_seller'
  | 'escalated'
  | 'outcome_offered'
  | 'outcome_accepted'
  | 'closed_for_seller'
  | 'withdrawn';

/**
 * Evidence lifecycle. `transferred` means the bytes are on the object store but nothing has said
 * they belong to this dispute; only `attached` may be described to a buyer as uploaded. The
 * separation exists because a connection that dies between transfer and attach leaves bytes that
 * no reviewer will ever see, and a UI that says "uploaded" at that moment is lying about evidence.
 */
export type EvidenceStatus = 'requested' | 'transferred' | 'attached' | 'rejected';

export type EvidenceRejectionCode =
  | 'too_large'
  | 'unsupported_mime'
  | 'checksum_mismatch'
  | 'slot_expired'
  | 'evidence_window_closed';

export interface EvidenceDto {
  readonly id: string;
  readonly filename: string;
  readonly mime: string;
  readonly bytes: number;
  readonly sha256: string | null;
  readonly status: EvidenceStatus;
  readonly uploadedBy: DisputeRole | 'service';
  /** Present only when `status === 'rejected'`. */
  readonly rejectionCode?: EvidenceRejectionCode;
  /** Set by the service when the evidence joins the case file; `null` means not in the file yet. */
  readonly attachedAt: string | null;
}

export type TimelineEventKind =
  | 'dispute_opened'
  | 'evidence_attached'
  | 'statement_amended'
  | 'review_started'
  | 'question_asked'
  | 'response_given'
  | 'escalated'
  | 'outcome_offered'
  | 'outcome_accepted'
  | 'outcome_declined'
  | 'return_requested'
  | 'return_received'
  | 'refund_requested'
  | 'refund_settled'
  | 'sla_extended'
  | 'closed_for_seller'
  | 'withdrawn';

export interface TimelineEventDto {
  readonly id: string;
  /** ISO-8601 as the service recorded it. Ordering is by this, never by arrival at the client. */
  readonly at: string;
  readonly actor: DisputeRole | 'service';
  readonly kind: TimelineEventKind;
  readonly title: string;
  readonly body: string;
  /**
   * The honesty field. `refund_requested` is NOT money-bearing (`REFUND_INITIATED` moves nothing;
   * only `REFUND_SETTLED` does), and a timeline that renders it identically to a settled refund
   * tells a seller they have been debited when they have not.
   */
  readonly moneyBearing: boolean;
  /** Which party the service is now waiting on, if any. */
  readonly awaiting?: DisputeRole | 'service';
}

/**
 * The clock the service holds. `asOf` is the service's own timestamp for this read, so a buyer who
 * closes the tab and comes back three days later gets the same answer the service would give,
 * rather than a countdown the browser started when the page loaded.
 * // CONTRACT-GAP: every dispute read must carry `asOf` and `dueAt`; if the PHP side only stores
 * // `dueAt`, the UI still needs `asOf` in the response or the remaining time is a client guess.
 */
export interface SlaDto {
  readonly dueAt: string;
  readonly asOf: string;
  /** A paused clock is not a running one: a hold for the buyer's answer must not read as "late". */
  readonly paused: boolean;
  readonly pauseReason?: string;
  readonly awaiting?: DisputeRole | 'service';
  /** Plain-language basis for the date, e.g. "14 days from handover confirmation". */
  readonly basis: string;
}

/**
 * Outcomes. `booked` is the whole point: `true` only once the ledger has applied a money-bearing
 * event, `false` for anything still awaiting the other party's answer.
 */
export type OutcomeKind = 'full_refund' | 'partial_refund' | 'return_and_refund' | 'no_action';

export interface OutcomeDto {
  readonly id: string;
  readonly kind: OutcomeKind;
  readonly refundToBuyer: Money;
  readonly releaseToSeller: Money;
  /** Null when the commission is untouched. Reversal is a ledger fact, not a UI promise. */
  readonly commissionReversal: Money | null;
  readonly returnRequired: boolean;
  readonly proposedAt: string;
  /** The service's own reasoning, quoted. Not paraphrased by the frontend. */
  readonly explanation: string;
  readonly moneyBearing: boolean;
  readonly booked: boolean;
  /** The date the offer lapses back to review, if the service imposes one. */
  readonly expiresAt?: string;
  /** Per-party acceptance. An offer accepted by one side is not an accepted outcome. */
  readonly acceptedBy?: DisputeRole;
}

/** Narrowed view of the listing's condition record — the text the dispute process reads. */
export interface ConditionRecordDto {
  readonly listingId: string;
  readonly title: string;
  readonly claimScope: ClaimScope;
  readonly captions: readonly {
    readonly disclosureId: string;
    readonly disclosureText: string;
    readonly severity: DisputeSeverity;
  }[];
}

/** Everything eligibility needs, in one read, so a page does not need three round trips to decide
 *  whether to offer a form at all. */
export interface OrderSnapshotDto {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly itemPrice: Money;
  readonly buyerTotal: Money;
  readonly paidAt: string | null;
  readonly handoverConfirmedAt: string | null;
  readonly completedAt: string | null;
  /** The service's clock, so the window maths never runs on a device with a wrong date. */
  readonly asOf: string;
  /**
   * // CONTRACT-GAP: the dispute window is policy, not client knowledge. The PHP side must return
   * // the order's window in days; the UI's local fallback is only used when this is absent.
   */
  readonly windowDays?: number;
  readonly openDisputeId: string | null;
  readonly conditionRecord: ConditionRecordDto | null;
  /**
   * // CONTRACT-GAP: the commission actually taken on this sale, from `src/Commissions`. The partial
   * // refund panel can only sanity-check a reversal against it; absent, the check is skipped rather
   * // than guessed at 10 %.
   */
  readonly commissionTaken?: Money | undefined;
}

export interface DisputeDto {
  readonly id: string;
  readonly orderId: string;
  readonly state: DisputeState;
  readonly openedAt: string;
  readonly openedBy: DisputeRole;
  /** One of the UI's reason codes; the service owns the canonical enum. */
  readonly reasonCode: string;
  readonly severity: DisputeSeverity;
  readonly statement: string;
  readonly evidence: readonly EvidenceDto[];
  readonly timeline: readonly TimelineEventDto[];
  readonly sla: SlaDto;
  readonly outcome?: OutcomeDto | undefined;
  /**
   * // CONTRACT-GAP: assumed to be embedded on the dispute read. The return steps panel needs the
   * // issued instruction (method, scheduledFor, trackingRef); if `src/Disputes` keeps returns in a
   * // separate resource, the controller must either embed it or give me `getReturnInstruction`.
   */
  readonly returnInstruction?: ReturnInstructionDto | undefined;
  readonly version: number;
  /** Set when the party is expected to do something the service can name. */
  readonly awaitingYou?: AwaitRequestDto | undefined;
}

/** What the service is asking of the reader, in its words — the `awaiting-you` panel renders this
 *  verbatim rather than inventing a to-do list. */
export interface AwaitRequestDto {
  readonly kind: 'add_evidence' | 'answer_question' | 'respond_to_outcome' | 'return_item';
  readonly instruction: string;
  readonly by: string;
  /** Ids the reader may need to act on (an outcome id, a question id). */
  readonly refId?: string;
  /** Evidence the service still considers missing; drives "describe it in words" when uploads fail. */
  readonly suggestedEvidence?: readonly string[];
}

export interface ReturnInstructionDto {
  readonly disputeId: string;
  readonly method: 'collect' | 'post' | 'meet';
  readonly issuedAt: string;
  readonly instructions: string;
  /** Null until the service books a carrier; a UI must not render a collection date it invented. */
  readonly scheduledFor: string | null;
  readonly trackingRef: string | null;
}

export interface EscalationDto {
  readonly disputeId: string;
  readonly escalatedAt: string;
  readonly ref: string;
  /**
   * The scope the platform is handing over because it cannot decide it. A 3D render or a photo
   * cannot evidence movement, water resistance or authenticity, so escalation records that the
   * human review is not a substitute for those either.
   */
  readonly outsidePlatformScope: readonly string[];
  readonly whatHappensNext: string;
}

/** A slot is the service's permission to hold bytes. It expires; the UI must not pretend otherwise. */
export interface EvidenceSlotDto {
  readonly slotId: string;
  readonly filename: string;
  readonly mime: string;
  readonly bytes: number;
  readonly expiresAt: string;
  /** Opaque transfer handle. Never rendered, never logged: treat it like the signed URLs do. */
  readonly transferRef: string;
}

/**
 * How the UI talks to one transfer, and the only reason `transferEvidence` is not just a byte write.
 *
 * `onProgress` is deliberately the *only* feedback channel a progress bar may read, and it is
 * explicitly not a completion signal: the transport can report that every byte left the device while
 * the case file still refuses the attachment. `signal` has to abort mid-stream because a buyer who
 * taps "stop" on a 24 MB bundle on LTE expects the radio to actually stop.
 * // CONTRACT-GAP: the Media module's capture upload needs the same two things; if `src/Disputes`
 * // reuses that helper this shape comes free, and if it does not, the controller is holding two
 * // abort/progress conventions and should pick one.
 */
export interface TransferOptions {
  /** Bytes acknowledged so far, out of `totalBytes` when the transport knows the total. */
  readonly onProgress?: (sentBytes: number, totalBytes?: number) => void;
  readonly signal?: AbortSignal;
}

export interface OpenDisputeCmd {
  readonly orderId: string;
  readonly actor: DisputeRole;
  readonly reasonCode: string;
  readonly severity: DisputeSeverity;
  readonly statement: string;
  /** Evidence already attached to the slots; the dispute opens with them or the UI must say so. */
  readonly attachedEvidenceIds: readonly string[];
  /** Reused across retries of the same deliberate tap; a new intent gets a new key. */
  readonly idempotencyKey: string;
}

export interface RequestEvidenceSlotCmd {
  readonly orderId: string;
  readonly disputeId?: string;
  readonly filename: string;
  readonly mime: string;
  readonly bytes: number;
  /** Null when this browser exposes no digest primitive — the service verifies on its own side. */
  readonly sha256: string | null;
}

export interface AttachEvidenceCmd {
  readonly slotId: string;
  readonly sha256: string | null;
}

export interface RespondCmd {
  readonly disputeId: string;
  readonly actor: DisputeRole;
  readonly message: string;
  readonly addedEvidenceIds: readonly string[];
  readonly idempotencyKey: string;
}

export interface DecideOutcomeCmd {
  readonly disputeId: string;
  readonly outcomeId: string;
  readonly actor: DisputeRole;
  readonly idempotencyKey: string;
}

export interface EscalateCmd {
  readonly disputeId: string;
  readonly actor: DisputeRole;
  readonly note: string;
  readonly idempotencyKey: string;
}

/**
 * The failure taxonomy the UI is allowed to branch on. Mirrors `@nastech/api-client`'s `ApiError`
 * kinds so the controller can swap this for that class at integration without touching a call site.
 * Messages are static per kind: an error string must never carry a transfer ref or a URL.
 */
export type DisputeFailureKind =
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'validation'
  | 'conflict'
  | 'rateLimited'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'unknown';

const RETRYABLE: ReadonlySet<DisputeFailureKind> = new Set([
  'network',
  'timeout',
  'rateLimited',
  'aborted',
  'unknown',
]);

const FAILURE_MESSAGES: Readonly<Record<DisputeFailureKind, string>> = {
  unauthorized: 'Sign in again to open or follow this dispute.',
  forbidden: 'Only the buyer and the seller of this order can see this dispute.',
  notFound: 'We could not find that dispute.',
  validation: 'Something in the form needs to be fixed before it can be sent.',
  conflict: 'This dispute changed while you were writing. Nothing has been overwritten.',
  rateLimited: 'Too many attempts — give it a minute and try again.',
  network: 'We could not reach NasTech. Nothing has been sent.',
  timeout: 'NasTech took too long to answer. We do not yet know whether it arrived.',
  aborted: 'That upload stopped. The file was not sent.',
  unknown: 'Something went wrong on our side. Nothing has been changed.',
};

export class DisputeFailure extends Error {
  readonly kind: DisputeFailureKind;
  readonly retryable: boolean;
  /** Set when a `conflict` means "the other party already decided", so the UI can re-read instead. */
  readonly staleRead: boolean;

  constructor(kind: DisputeFailureKind, opts: { staleRead?: boolean } = {}) {
    super(FAILURE_MESSAGES[kind]);
    this.name = 'DisputeFailure';
    this.kind = kind;
    this.retryable = RETRYABLE.has(kind);
    this.staleRead = opts.staleRead === true;
  }
}

export function isDisputeFailure(value: unknown): value is DisputeFailure {
  return value instanceof DisputeFailure;
}

export function failureFromUnknown(value: unknown): DisputeFailure {
  if (isDisputeFailure(value)) return value;
  return new DisputeFailure('unknown');
}

/**
 * The whole seam. Fifteen operations, each with the transition it implies. A `disputeId` read must
 * return `sla.asOf`; every write takes an `idempotencyKey` because a retry after a dead connection
 * is normal, not exceptional, on a Johannesburg LTE handset.
 */
export interface DisputeService {
  /**
   * Read-only. No transition.
   * // CONTRACT-GAP: assumed `GET /v1/orders/{orderId}/dispute-snapshot?actor={role}` — must include
   * // status, party ids, the three dates, the service's `asOf`, the window in days, the open
   * // dispute id and the listing's condition record. Eligibility is decided client-side from this
   * // so an ineligible buyer gets an explanation with a date instead of a form that 403s.
   */
  getOrderSnapshot(orderId: string, actor: DisputeRole): Promise<OrderSnapshotDto>;

  /**
   * Read-only. No transition.
   * // CONTRACT-GAP: assumed `GET /v1/disputes/{disputeId}` — the tracking view. `timeline` must be
   * // ordered oldest-first and every event must carry `moneyBearing`.
   */
  getDispute(disputeId: string, actor: DisputeRole): Promise<DisputeDto>;

  /**
   * Order: `DISPUTE_OPENED` → `IN_DISPUTE` (legal from PAID, HANDOVER_SCHEDULED, HANDOVER_CONFIRMED).
   * Dispute: created in `open`, then `under_review` once a reviewer picks it up.
   * // CONTRACT-GAP: assumed `POST /v1/orders/{orderId}/disputes` + `Idempotency-Key`. Note
   * // `@nastech/api-client`'s `raiseDispute(orderId, reason)` already asserts a single-field
   * // `POST /v1/orders/{orderId}/dispute` — this command needs reason, severity, statement and
   * // evidence ids, so one of the two has to change. The ledger only has `DISPUTE_OPENED` and
   * // `DISPUTE_RESOLVED_TO_SELLER`; nothing here invents a third order event.
   */
  openDispute(cmd: OpenDisputeCmd): Promise<DisputeDto>;

  /**
   * Dispute: no state change, `version` bumps.
   * // CONTRACT-GAP: assumed `PATCH /v1/disputes/{disputeId}/statement` with an `If-Match` version;
   * // a stale read must come back as `conflict`, not silently win.
   */
  amendStatement(cmd: { disputeId: string; statement: string; version: number }): Promise<DisputeDto>;

  /**
   * No state change. Allocates storage for one file and returns an expiring slot.
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/evidence-slots` (or an order-scoped
   * // variant for the pre-open case). Needs an expiry so abandoned bytes can be swept.
   */
  requestEvidenceSlot(cmd: RequestEvidenceSlotCmd): Promise<EvidenceSlotDto>;

  /**
   * No state change; moves bytes into the slot. This is the only operation allowed to report
   * progress, and only `attachEvidence` may report completion.
   * // CONTRACT-GAP: assumed `PUT` to a slot-scoped URL issued by `requestEvidenceSlot`. The
   * // frontend cannot implement this: it needs the transfer mechanism the Media module uses for
   * // capture uploads. `signal` must abort mid-stream, not only between requests.
   */
  transferEvidence(slotId: string, body: Uint8Array, opts?: TransferOptions): Promise<void>;

  /**
   * Dispute: evidence enters the case file (`attached`), timeline gains `evidence_attached`.
   * // CONTRACT-GAP: assumed `POST /v1/evidence-slots/{slotId}/attach`. The response is the ONLY
   * // thing that may turn a progress bar into the word "uploaded".
   */
  attachEvidence(cmd: AttachEvidenceCmd): Promise<EvidenceDto>;

  /**
   * No state change. Frees a slot the buyer abandoned or whose transfer failed permanently.
   * // CONTRACT-GAP: assumed `DELETE /v1/evidence-slots/{slotId}`; must be safe to call twice.
   */
  abandonEvidenceSlot(slotId: string): Promise<void>;

  /**
   * Dispute: `awaiting_buyer`/`awaiting_seller` → `under_review`, and the clock's `paused` clears
   * with a new `dueAt` computed by the service.
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/responses`. The service must re-issue
   * // `sla.dueAt` here; the UI never extends a clock it was not given.
   */
  respondToDispute(cmd: RespondCmd): Promise<DisputeDto>;

  /**
   * Order: `REFUND_INITIATED` → `REFUND_PENDING` when the accepted outcome refunds. Money has NOT
   * moved — `REFUND_SETTLED` is what moves it, and nothing here can settle it.
   * Dispute: `outcome_offered` → `outcome_accepted`.
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/outcome/accept`. Needs to say what
   * // happens when the counterpart declines after one side accepted (`staleRead: true`).
   */
  acceptOutcome(cmd: DecideOutcomeCmd): Promise<DisputeDto>;

  /**
   * Dispute: `outcome_offered` → `under_review` (or `escalated` if the note asks for a person).
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/outcome/decline`.
   */
  declineOutcome(cmd: DecideOutcomeCmd): Promise<DisputeDto>;

  /**
   * Dispute: records `return_requested`; the order stays `IN_DISPUTE` until the item is back.
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/return`. Needs `scheduledFor` and
   * // `trackingRef` nullable — a UI that fills them in is booking a collection that no one made.
   */
  requestReturn(cmd: { disputeId: string; actor: DisputeRole; method: ReturnInstructionDto['method'] }): Promise<ReturnInstructionDto>;

  /**
   * Dispute: `return_requested` → return received, review resumes.
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/return/received`. Must be the service's
   * // confirmation (or the seller's, with the buyer's id attached), never the buyer's assertion.
   */
  confirmReturnReceived(cmd: { disputeId: string; actor: DisputeRole; idempotencyKey: string }): Promise<DisputeDto>;

  /**
   * Dispute: `under_review` → `escalated`. A named human, not a faster robot.
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/escalations`. The response must echo
   * // `outsidePlatformScope` — the claims a person with a photograph still cannot settle — so the
   * // buyer is not left believing escalation bought them a mechanical inspection.
   */
  escalate(cmd: EscalateCmd): Promise<EscalationDto>;

  /**
   * Dispute: any pre-offer state → `withdrawn`.
   * // CONTRACT-GAP: assumed `POST /v1/disputes/{disputeId}/withdraw`. NEEDS A LEDGER ANSWER: the
   * // order ladder has no `DISPUTE_WITHDRAWN` event, so the PHP side must state which order status
   * // a withdrawn dispute returns to (probably the status the dispute was opened from). Until that
   * // exists this operation stays unavailable in the UI.
   */
  withdraw(cmd: { disputeId: string; actor: DisputeRole; idempotencyKey: string }): Promise<DisputeDto>;
}

/** The identity of the reader. Supplied by the auth feature at integration; nothing in here
 *  derives it from a cookie, and a missing identity means "sign in", never "assume buyer". */
export interface DisputePrincipal {
  readonly actor: DisputeRole;
  readonly userId: string;
}
