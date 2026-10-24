import type { Money } from '@nastech/api-contracts';
import type { HandoverConfirmation } from '@nastech/api-client';

/**
 * Transport interface for the handover feature, shaped against the PHP module
 * (`nastech-market-php/src/Handover/*`). There is no HTTP layer yet, so every path below is
 * an assumption recorded in the orders README and the feature report.
 *
 * CONTRACT-GAP: assumed endpoints —
 *   GET  /v1/orders/{orderId}/handover            → HandoverTokenView | 404 (none scheduled)
 *   GET  /v1/handover/venues                      → venue catalogue (safe exchange places)
 *   GET  /v1/handover/slots?orderId=              → bookable slots, server-side SAST window
 *   POST /v1/orders/{orderId}/handover/schedule   (Idempotency-Key) → ScheduleResult (PIN once)
 *   POST /v1/handover-tokens/{tokenId}/present    { pin }           → HandoverConfirmation
 *   POST /v1/orders/{orderId}/handover/report-no-show               → NoShowReport
 *
 * Rules copied from the ledger and *not* negotiable in the UI:
 *   - `present` never receives a role; the gateway derives the actor from the authenticated
 *     principal (`ConfirmHandover::handle`), so each side must present the PIN themselves.
 *   - the PIN leaves the schedule call exactly once (`ScheduledHandover`), then is only a hash;
 *     a lost PIN means reissue, never recovery.
 *   - confirming a handover advances the order to HANDOVER_CONFIRMED; money is released only
 *     at COMPLETED. The confirmation is a precondition for release, not the release.
 */

export interface HandoverVenue {
  readonly id: string;
  readonly name: string;
  readonly area: string;
  /** Why this place was picked as a safe exchange point — the app's honest selling point. */
  readonly safetyNote: string;
  /** True if the venue is staffed/lighted after dark; drives the daylight-hours advice. */
  readonly staffed: boolean;
}

export interface HandoverSlot {
  readonly id: string;
  /** ATOM at +02:00 — the server speaks SAST, the client only formats. */
  readonly startIso: string;
  readonly endIso: string;
}

export interface HandoverTokenView {
  readonly tokenId: string;
  readonly orderId: string;
  readonly opensAtIso: string;
  readonly expiresAtIso: string;
  /** Server's clock at response time. All window maths start from this, never from the device. */
  readonly serverNowIso: string;
  readonly buyerConfirmed: boolean;
  readonly sellerConfirmed: boolean;
  readonly attemptsRemaining: number;
  readonly locked: boolean;
  readonly revoked: boolean;
  /** What stays held until the order completes — the number `not-shown` must state honestly. */
  readonly heldBuyerTotal: Money;
  readonly venueId: string | null;
  readonly slot: HandoverSlot | null;
}

export interface ScheduleResult {
  readonly token: HandoverTokenView;
  /**
   * Plaintext PIN, returned once, mirroring `ScheduledHandover`. The UI shows it exactly once
   * and there is no endpoint that reads it back; losing it means reissue.
   */
  readonly pin: string;
}

/**
 * Outcome of one PIN presentation. The kinds track `HandoverToken::present`'s real failure
 * modes — an unusable token throws with a reason (`unusableReason`), a wrong PIN is *not* an
 * error path but a state change (the attempt counter moved).
 */
export type PresentPinResult =
  | { readonly kind: 'recorded'; readonly confirmation: HandoverConfirmation }
  | { readonly kind: 'wrong_pin'; readonly attemptsRemaining: number }
  | { readonly kind: 'locked' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'already_presented' };

export interface NoShowReport {
  readonly orderId: string;
  /** True means a refund REQUEST opened (REFUND_INITIATED → REFUND_PENDING). */
  readonly refundRequested: boolean;
  /**
   * Always false at request time — `Order::isMoneyBearing` excludes REFUND_INITIATED. A UI that
   * shows "money returned" from this call would be lying to the buyer.
   */
  readonly moneyMovedNow: boolean;
  readonly moneyPosition: 'held' | 'returned' | 'none';
}

export interface SlotOffer {
  readonly slots: readonly HandoverSlot[];
  /** The server's clock when the offer was built — the client never decides which slots are past. */
  readonly serverNowIso: string;
}

export interface HandoverTransport {
  getActiveHandover(orderId: string): Promise<HandoverTokenView | null>;
  listVenues(): Promise<readonly HandoverVenue[]>;
  listSlots(orderId: string): Promise<SlotOffer>;
  scheduleHandover(orderId: string, input: { venueId: string; slotId: string }): Promise<ScheduleResult>;
  /** No role parameter on purpose — see the contract note above. */
  presentPin(orderId: string, pin: string): Promise<PresentPinResult>;
  reissueHandover(orderId: string): Promise<ScheduleResult>;
  reportNoShow(orderId: string): Promise<NoShowReport>;
}
