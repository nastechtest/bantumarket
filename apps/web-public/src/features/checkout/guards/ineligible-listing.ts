/**
 * Ineligibility copy — the "why", in the buyer's language.
 *
 * A refused checkout with a generic error is the single biggest support cost in a marketplace
 * like this one: the buyer cannot tell whether they did something wrong, whether the seller did,
 * or whether NasTech took their money and shrugged. Each code below answers, in plain words,
 * (a) what stopped this, (b) what happened to any money, and (c) what to do next. The codes
 * mirror the real domain refusals in `CreateOrder.php` (listing not ACTIVE, self-sale, total
 * below price), the ledger's state facts (`ORDER_TERMINAL`, `NOT_AWAITING_PAYMENT`) and this UI's
 * own guards.
 */

import type { CheckoutView, IneligibilityCode } from '../api/checkout-transport.js';
import { checkPriceIntegrity } from './price-integrity.js';
import { checkSingleItem } from './single-item-checkout.js';

/**
 * Codes only the client can detect: the wire itself is inconsistent, so no server verdict exists to
 * name. They join the server's `IneligibilityCode` rather than being smuggled into it, because the
 * server never emits them and a reviewer must be able to tell the two apart.
 */
export type CheckoutGuardCode = 'BUYER_TOTAL_BELOW_PRICE' | 'FEE_TOTAL_MISMATCH' | 'BAD_AMOUNT';

/** Everything the outcome screen may be asked to render copy for. */
export type CheckoutRefusalCode = IneligibilityCode | CheckoutGuardCode;

export interface IneligibilityCopy {
  readonly title: string;
  readonly body: string;
  readonly nextStep: string;
}

const COPY: Readonly<Record<CheckoutRefusalCode, IneligibilityCopy>> = {
  LISTING_NOT_ACTIVE: {
    title: 'This listing is no longer on the market',
    body: 'The seller took this listing down (it is no longer marked active), so it cannot be bought or paid for. Nothing has been charged to you.',
    nextStep: 'Browse other watches in NasTech Market, or message the seller about restocking.',
  },
  LISTING_RESERVED_BY_OTHER: {
    title: 'This item was bought first',
    body: 'The listing this order points at is already reserved by another buyer’s checkout. First order holds the item; nothing was charged to you on this one.',
    nextStep: 'Find a similar listing in search. Your saved searches are unaffected.',
  },
  SELF_SALE: {
    title: 'You cannot buy your own listing',
    body: 'The ledger refuses an order where the buyer and the seller are the same person — self-sales are how marketplace balances get invented. No payment can be taken for this order.',
    nextStep: 'If you believe this is a mistake (a family member’s account, for instance), contact support with the order ID.',
  },
  PRICE_CHANGED_AFTER_QUOTE: {
    title: 'The price here no longer matches the order',
    body: 'The amounts on this screen disagree with the amounts recorded on the order. We stop the checkout rather than ask you to pay a number the ledger does not recognise. Nothing has been charged.',
    nextStep: 'Reload this page to fetch the recorded order again; if it keeps happening, contact support with the order ID.',
  },
  BUYER_TOTAL_BELOW_PRICE: {
    title: 'This order’s total is below its item price',
    body: 'The ledger never creates an order whose buyer total is lower than the item price, so this view cannot be the real order. Payment is blocked. Nothing has been charged.',
    nextStep: 'Contact support with the order ID — this is our problem to fix, not yours.',
  },
  FEE_TOTAL_MISMATCH: {
    title: 'The fees listed here do not add up to the total',
    body: 'The fee lines shown do not reconcile with the recorded total. We do not ask you to pay an amount we cannot tie back to the ledger. Nothing has been charged.',
    nextStep: 'Reload to fetch the order again; if it persists, contact support.',
  },
  BAD_AMOUNT: {
    title: 'The amounts on this order are not usable',
    body: 'A price, item or fee line arrived that is not a whole South African cent amount, or is in a currency other than rand. The ledger only ever stores whole rand cents, so this view is not a faithful copy of your order and we will not ask you to pay against it. Nothing has been charged.',
    nextStep: 'Reload this page to fetch the order again. If it keeps happening, contact support with the order ID — a bad amount on our side is our fix, not a payment you should retry.',
  },
  ORDER_NOT_AWAITING_PAYMENT: {
    title: 'This order is no longer awaiting payment',
    body: 'The order has already moved past the payment step (paid, refunded, cancelled or in dispute). Paying it again is impossible by design — the ledger will not take a second capture for one order.',
    nextStep: 'Check the order’s current status on the order screen shown here, or open the dispute flow if it looks wrong.',
  },
  ORDER_TERMINAL: {
    title: 'This order is closed',
    body: 'The order reached a final state (completed, cancelled or refunded) — final states have no way out in the ledger, so there is nothing left to pay. Nothing will be charged.',
    nextStep: 'To buy this item again the seller would need a new listing; ask them, or contact support if a refund is involved.',
  },
  MULTI_ITEM_NOT_SUPPORTED: {
    title: 'This pilot checks out one item at a time',
    body: 'The order view sent to this screen carries more than one line, and the ledger prices exactly one listing per order. We are not showing you a total we cannot pay for correctly. Nothing has been charged.',
    nextStep: 'Pay for one item at a time; a combined cart comes after the pilot.',
  },
  METHOD_NOT_OFFERED: {
    title: 'That payment method is not available for this order',
    body: 'The method you picked is not offered for this order (cash on handover and instant EFT depend on the listing and the pilot city). Your order is intact and no money has moved.',
    nextStep: 'Go back and choose one of the listed methods.',
  },
  UNKNOWN: {
    title: 'This checkout cannot continue right now',
    body: 'Something about this order does not pass our checks, and we would rather refuse than ask you to pay against numbers we cannot verify. Nothing has been charged.',
    nextStep: 'Contact support with the order ID shown here.',
  },
};

export function ineligibilityCopy(code: CheckoutRefusalCode): IneligibilityCopy {
  return COPY[code];
}

/**
 * Compose the three authorities into one verdict, server code first: the API's own ineligibility
 * wins, then the ledger-shape guards. Returns the code the outcome screen renders.
 */
export function deriveIneligibility(view: CheckoutView): CheckoutRefusalCode | null {
  if (view.ineligibilityCode !== null) return view.ineligibilityCode;

  const single = checkSingleItem(view);
  if (!single.ok) return single.failure.code;

  const price = checkPriceIntegrity(view);
  if (!price.ok) return price.failure.code;

  // A terminal or already-paid order is not "ineligible to view" — the outcome screen tells that
  // truth better; ineligibility here means "cannot pay, and must be told why".
  return null;
}
