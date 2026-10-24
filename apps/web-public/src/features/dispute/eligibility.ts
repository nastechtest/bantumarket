/**
 * Who may open a dispute, and who has to be told no — as a pure function over the order snapshot.
 *
 * This is pure deliberately: `Date` never enters from the environment, `now` is the service's `asOf`,
 * and the only inputs are the ladder and the dates the ledger already has. An ineligible buyer must
 * get the exact rule that excluded them and the date that triggered it ("the window from your
 * handover closed on 12 June, eight days ago"), because the alternative — a form that fails when
 * they press send — teaches them that the platform wastes their time.
 *
 * The ladder below is the ledger's real one, imported from `@nastech/api-client`'s transcription of
 * `Order.php`; the brief's earlier paraphrase (`pending_payment → paid → handed_over`) does not exist
 * server-side and is not repeated here.
 */

import type { OrderStatus } from '@nastech/api-client';
import type { OrderSnapshotDto } from './api/dispute-transport.js';
import { addDaysIso, formatLongDate, signedDaysUntil, wholeDaysBetween } from './clock.js';

/**
 * // CONTRACT-GAP: authoritative window lives in `src/Disputes` and must come back on the snapshot.
 * This number only speaks when the service said nothing, and it is 14 days from the handover because
 * that is the pilot's returns promise — it is not the dispute module's answer.
 */
export const FALLBACK_DISPUTE_WINDOW_DAYS = 14;

/**
 * `PAID`..`COMPLETED`, exactly the four states `Order::TRANSITIONS` allows `DISPUTE_OPENED` from.
 * `AWAITING_PAYMENT` is excluded because there is nothing to dispute yet; `CANCELLED` and `REFUNDED`
 * are terminal with no outgoing edge; `REFUND_PENDING` is excluded because a refund is already in
 * motion and a dispute filed against it would compete with the money path rather than join it.
 * `IN_DISPUTE` is not an eligibility answer, it is the tracking view, so it is handled by
 * `already_open` below.
 */
export const DISPUTE_ADMITTING_STATUSES: readonly OrderStatus[] = [
  'PAID',
  'HANDOVER_SCHEDULED',
  'HANDOVER_CONFIRMED',
  'COMPLETED',
];

export type EligibilityCode =
  | 'can_open'
  | 'already_open'
  | 'window_closed'
  | 'state_awaiting_payment'
  | 'state_cancelled'
  | 'state_refund_pending'
  | 'state_refunded'
  | 'state_in_dispute_missing_id'
  | 'state_unrecognised'
  | 'wrong_party'
  | 'no_handover_date';

/** The verdict, and the two fields every refusal must carry: the rule in one line and the date that
 *  caused it. `governingDateIso` is null only where no date is responsible (wrong party). */
export interface EligibilityVerdict {
  readonly canOpen: boolean;
  readonly code: EligibilityCode;
  readonly headline: string;
  readonly detail: string;
  readonly governingDateIso: string | null;
  readonly governingDateLabel: string | null;
  /** What the person should do instead. Never an empty promise, never "contact support". */
  readonly nextStep: string;
  /** Present for `already_open`: the tracking view takes over from here. */
  readonly openDisputeId: string | null;
  /** Present for `can_open` and `window_closed`: the window the buyer is inside or outside. */
  readonly windowOpensAt: string | null;
  readonly windowClosesAt: string | null;
  readonly daysRemaining: number | null;
}

export interface EligibilityInput {
  readonly snapshot: OrderSnapshotDto;
  readonly actorUserId: string;
  readonly actorRole: 'buyer' | 'seller';
}

/**
 * The date the window runs from: the last thing that actually happened to the item. A handover
 * confirmed and then completed on a later day means the clock runs from the confirmation — the buyer
 * had the item in hand then. A completed order with no confirmation date (data from before the
 * handover module) falls back to `completedAt`, then `paidAt`.
 */
export function windowAnchorIso(snapshot: OrderSnapshotDto): string | null {
  if (snapshot.handoverConfirmedAt !== null) return snapshot.handoverConfirmedAt;
  if (snapshot.completedAt !== null) return snapshot.completedAt;
  if (snapshot.paidAt !== null) return snapshot.paidAt;
  return null;
}

export function disputeWindowDays(snapshot: OrderSnapshotDto): number {
  return snapshot.windowDays ?? FALLBACK_DISPUTE_WINDOW_DAYS;
}

function refusal(
  code: Exclude<EligibilityCode, 'can_open'>,
  fields: {
    headline: string;
    detail: string;
    nextStep: string;
    governingDateIso?: string | null;
    governingDateLabel?: string | null;
    openDisputeId?: string | null;
    windowOpensAt?: string | null;
    windowClosesAt?: string | null;
    daysRemaining?: number | null;
  },
): EligibilityVerdict {
  return {
    canOpen: false,
    code,
    headline: fields.headline,
    detail: fields.detail,
    governingDateIso: fields.governingDateIso ?? null,
    governingDateLabel: fields.governingDateLabel ?? null,
    nextStep: fields.nextStep,
    openDisputeId: fields.openDisputeId ?? null,
    windowOpensAt: fields.windowOpensAt ?? null,
    windowClosesAt: fields.windowClosesAt ?? null,
    daysRemaining: fields.daysRemaining ?? null,
  };
}

export function assessEligibility(input: EligibilityInput): EligibilityVerdict {
  const { snapshot, actorUserId, actorRole } = input;

  // Party first, and it is decided from the snapshot's ids, never from the claimed role alone: a
  // buyer id that is not on this order gets a refusal, not somebody else's dispute.
  const expectedId = actorRole === 'buyer' ? snapshot.buyerId : snapshot.sellerId;
  if (actorUserId !== expectedId) {
    return refusal('wrong_party', {
      headline: 'This order is not yours to dispute',
      detail: `Only the buyer (${snapshot.buyerId}) or the seller (${snapshot.sellerId}) of ${snapshot.orderId} can raise a dispute about it. You are signed in as ${actorUserId}.`,
      nextStep: 'Sign in with the account that placed this order, or open the dispute from the order in your own list.',
    });
  }

  if (snapshot.openDisputeId !== null) {
    return refusal('already_open', {
      headline: 'There is already a dispute on this order',
      detail: `Dispute ${snapshot.openDisputeId} is open. A second one on the same order would split the case file and slow both of you down.`,
      nextStep: 'Follow the existing dispute and add anything new to it there.',
      openDisputeId: snapshot.openDisputeId,
    });
  }

  switch (snapshot.status) {
    case 'AWAITING_PAYMENT':
      return refusal('state_awaiting_payment', {
        headline: 'Nothing has been paid yet',
        detail: 'A dispute is about goods that changed hands or money that left your account. This order has done neither, so there is nothing for us to decide.',
        nextStep: 'If you did not mean to place this order, cancel it from the order page.',
      });
    case 'CANCELLED':
      return refusal('state_cancelled', {
        headline: 'This order was cancelled',
        detail: 'A cancelled order never reached handover, so there is no item to assess and no payment on this order to refund.',
        nextStep: 'If money left your account for a cancelled order, that is a payments matter rather than a dispute — raise it from the order page.',
      });
    case 'REFUND_PENDING':
      return refusal('state_refund_pending', {
        headline: 'A refund is already in motion',
        detail: 'The refund on this order has been requested and is waiting to be settled by the ledger. Nothing has reached your account yet, and opening a dispute now would compete with that refund rather than add to it.',
        nextStep: 'Watch the order page: it says when the refund is booked, and it will only say that when the money has actually moved.',
      });
    case 'REFUNDED':
      return refusal('state_refunded', {
        headline: 'This order has already been refunded',
        detail: 'The refund was settled, which closes what a dispute could ask for on this order.',
        nextStep: 'If the refunded amount was wrong, that is a ledger question — the order page has the reference a reviewer needs.',
      });
    case 'IN_DISPUTE':
      // No `openDisputeId` means the read is inconsistent: the order is disputed but the service did
      // not say by whom. Rendering an intake form here would let a second dispute be filed against a
      // case that already exists, so refuse and ask for a fresh read.
      return refusal('state_in_dispute_missing_id', {
        headline: 'This order is already in dispute',
        detail: 'The order is marked as disputed, but this read did not carry the dispute reference. We will not open a second one on top of it.',
        nextStep: 'Reload this page, or open the dispute from your disputes list.',
      });
    case 'PAID':
    case 'HANDOVER_SCHEDULED':
    case 'HANDOVER_CONFIRMED':
    case 'COMPLETED':
      break;
    default: {
      // Unreachable for the imported union today. Written as a guard rather than a `break` so that
      // when the ledger grows a state, TypeScript stops the build here instead of letting a brand
      // new state default to "eligible to dispute".
      const unhandled: never = snapshot.status;
      return refusal('state_unrecognised', {
        headline: 'This order state cannot be disputed here',
        detail: `The order is recorded as ${String(unhandled)}, which the dispute screen has no rule for. We will not guess which rule applies to your money.`,
        nextStep: 'Reload, and if it persists quote the order reference when you contact us.',
      });
    }
  }

  const anchor = windowAnchorIso(snapshot);
  if (anchor === null) {
    // A state that admits a dispute with no date behind it cannot be windowed honestly. Say which
    // date is missing rather than guess a window.
    return refusal('no_handover_date', {
      headline: 'We cannot tell when your window started',
      detail: `This order is in ${String(snapshot.status)} but the record carries no handover or payment date, so there is nothing to measure ${disputeWindowDays(snapshot)} days from.`,
      nextStep: 'Reload this page. If it persists, the order record needs the date before a dispute can be timed.',
    });
  }

  const windowDays = disputeWindowDays(snapshot);
  const windowOpensAt = anchor;
  const windowClosesAt = addDaysIso(anchor, windowDays);
  const daysRemaining = signedDaysUntil(snapshot.asOf, windowClosesAt);

  const openFields = {
    governingDateIso: anchor,
    governingDateLabel: `${windowDays}-day window opens ${formatLongDate(anchor)}`,
    windowOpensAt,
    windowClosesAt,
  } as const;

  if (daysRemaining < 0) {
    const closedFor = wholeDaysBetween(windowClosesAt, snapshot.asOf);
    return refusal('window_closed', {
      ...openFields,
      headline: 'The dispute window on this order has closed',
      detail: `You could have raised a dispute until ${formatLongDate(windowClosesAt)}, ${windowDays} days after ${formatLongDate(anchor)}. That date passed ${closedFor} ${closedFor === 1 ? 'day' : 'days'} ago, and the screen cannot reopen a window we no longer hold.`,
      nextStep:
        'You may still have a claim against the seller directly, and the Ombud or a small claims court can take a matter the platform window has closed. The external routes are listed below the refusal.',
      governingDateIso: windowClosesAt,
      governingDateLabel: `Window closed ${formatLongDate(windowClosesAt)}`,
      daysRemaining,
    });
  }

  return {
    canOpen: true,
    code: 'can_open',
    headline: `You can open a dispute until ${formatLongDate(windowClosesAt)}`,
    detail: `That is ${windowDays} days from ${formatLongDate(anchor)}. ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left on the service’s clock.`,
    governingDateIso: windowClosesAt,
    governingDateLabel: `Window closes ${formatLongDate(windowClosesAt)}`,
    nextStep: 'Choose what is wrong and write it down. Nothing is sent until you press send.',
    openDisputeId: null,
    daysRemaining,
    windowOpensAt,
    windowClosesAt,
  };
}

export interface RefusalCopy {
  readonly headline: string;
  readonly detail: string;
  readonly nextStep: string;
}

/** Exposed so the closed-window screen can quote the external routes without re-deriving the rule. */
export function refusalCopy(verdict: EligibilityVerdict): RefusalCopy {
  return { headline: verdict.headline, detail: verdict.detail, nextStep: verdict.nextStep };
}
