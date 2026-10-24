import type { Cents, CaptureJobState, Money, VerificationTier } from '@nastech/api-contracts';
import type { OrderStatus } from '@nastech/api-client';

/**
 * The seller's home screen reads one denormalised snapshot rather than six endpoints. The shell
 * cannot afford six round trips on a data-queue phone, and the ordering decision below needs the
 * money values side by side.
 *
 * CONTRACT-GAP: assumed endpoint —
 *   GET /v1/seller/dashboard   (returns everything below in one response)
 * The PHP build has no HTTP layer yet, so this is an interface with a fixture implementation.
 * Swapping in a real adapter must not change a single component.
 */

export type ListingStage =
  | 'draft'
  | 'in_review'
  | 'live'
  | 'paused'
  | 'withdrawn'
  | 'expired'
  | 'sold'
  | 'rejected';

/** Why a listing is not live yet, and which side is being waited on. */
export interface ReviewWait {
  readonly waitingOn: 'NasTech review' | 'you';
  readonly since: string;
  readonly note: string;
}

export interface DashboardListing {
  readonly id: string;
  readonly title: string;
  readonly stage: ListingStage;
  readonly price: Money;
  readonly submittedAt: string | null;
  readonly wentLiveAt: string | null;
  readonly review: ReviewWait | null;
}

export interface DashboardOrder {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly state: OrderStatus;
  readonly amount: Money;
  readonly handoverAt: string | null;
  readonly buyerName: string;
}

export interface PayoutSnapshot {
  readonly payable: Money;
  readonly pending: Money;
  readonly nextPayoutDate: string | null;
  readonly status: 'none' | 'scheduled' | 'failed' | 'paid';
  readonly failedReason: string | null;
}

export interface CaptureSnapshot {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly jobState: CaptureJobState;
  readonly updatedAt: string;
  /** Operator's words when a job was rejected; never a generic "something went wrong". */
  readonly operatorNote: string | null;
}

export type AttentionKind =
  | 'handover_unscheduled'
  | 'payout_failed'
  | 'bank_details_missing'
  | 'capture_rejected'
  | 'review_waiting_on_you'
  | 'listing_in_review'
  | 'draft_unfinished'
  | 'question_unanswered';

export interface AttentionItem {
  readonly id: string;
  readonly kind: AttentionKind;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  /** ISO instant the platform is waiting until, when there is one. */
  readonly dueAt: string | null;
  /** Money the seller cannot receive until this is done. Zero is a real value. */
  readonly blockingValue: Cents;
}

export interface DashboardSnapshot {
  readonly seller: {
    readonly displayName: string;
    readonly tier: VerificationTier;
    readonly joinedAt: string;
  };
  readonly listings: {
    readonly byStage: Readonly<Record<ListingStage, number>>;
    readonly recent: readonly DashboardListing[];
  };
  readonly orders: {
    readonly waitingOnYou: number;
    readonly moneyHeld: Money;
    readonly recent: readonly DashboardOrder[];
  };
  readonly payout: PayoutSnapshot;
  readonly capture: CaptureSnapshot | null;
  readonly attention: readonly AttentionItem[];
  readonly firstListingAt: string | null;
  readonly firstWentLiveAt: string | null;
}

export interface DashboardTransport {
  load(signal?: AbortSignal): Promise<DashboardSnapshot>;
}

export class DashboardTransportError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'DashboardTransportError';
    this.retryable = retryable;
  }
}
