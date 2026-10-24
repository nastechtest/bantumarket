/**
 * Price integrity: compare the server's numbers against each OTHER server number.
 *
 * This is the one place cents are added — and what gets added is two views of the same ledger row,
 * so the sum can only ever disagree with a third view if the wire lied or the view went stale.
 * The UI never PRICES anything with this: a failure blocks the checkout with an explanation; it
 * never "corrects" a total, because the total is not the UI's to correct.
 *
 * Invariants transcribed from the PHP money path:
 *   - `CreateOrder`: `buyerTotal >= itemPrice` ("the difference is the platform's, not the
 *     seller's") and the order COPIES the listing price at creation;
 *   - `RecordProviderPayment`: the provider's captured amount must EQUAL `buyerTotal` or the
 *     payment is quarantined as a discrepancy — a checkout screen that displayed a different
 *     number than the ledger would be the client-side twin of that bug;
 *   - `money()` in api-contracts: whole cents, ZAR, no float anywhere.
 */

import type { CheckoutView } from '../api/checkout-transport.js';
import { isZar } from '../summary/currency.js';

export type PriceIntegrityFailure =
  | { code: 'PRICE_CHANGED_AFTER_QUOTE'; detail: string }
  | { code: 'BUYER_TOTAL_BELOW_PRICE'; detail: string }
  | { code: 'FEE_TOTAL_MISMATCH'; detail: string }
  | { code: 'BAD_AMOUNT'; detail: string };

export type PriceIntegrity = { ok: true } | { ok: false; failure: PriceIntegrityFailure };

function wholeCents(value: number): boolean {
  return Number.isInteger(value);
}

export function checkPriceIntegrity(view: CheckoutView): PriceIntegrity {
  const { order, items, feeRows } = view;

  if (!isZar(order.itemPrice) || !isZar(order.buyerTotal)) {
    return {
      ok: false,
      failure: { code: 'BAD_AMOUNT', detail: 'A money row arrived in a currency other than ZAR.' },
    };
  }
  if (!wholeCents(order.itemPrice.cents) || !wholeCents(order.buyerTotal.cents)) {
    return {
      ok: false,
      failure: { code: 'BAD_AMOUNT', detail: 'A money row arrived in fractional cents.' },
    };
  }

  // The order copies the listing price at creation (CreateOrder). One line item priced differently
  // from the order's own `itemPrice` means the quote and the ledger disagree — a price changed
  // after the quote, or a stale view.
  const lineTotal = items.reduce((acc, item) => {
    if (!isZar(item.unitPrice) || !wholeCents(item.unitPrice.cents)) {
      return acc + Number.NaN;
    }
    return acc + item.unitPrice.cents * item.quantity;
  }, 0);
  if (Number.isNaN(lineTotal)) {
    return { ok: false, failure: { code: 'BAD_AMOUNT', detail: 'A line item carries a bad amount.' } };
  }
  if (lineTotal !== order.itemPrice.cents) {
    return {
      ok: false,
      failure: {
        code: 'PRICE_CHANGED_AFTER_QUOTE',
        detail: 'The line items shown here no longer match the price recorded on the order.',
      },
    };
  }

  // CreateOrder refuses `buyerTotal < itemPrice` outright; seeing it means this view is fiction.
  if (order.buyerTotal.cents < order.itemPrice.cents) {
    return {
      ok: false,
      failure: {
        code: 'BUYER_TOTAL_BELOW_PRICE',
        detail: 'The buyer total is below the item price; the ledger could not have created this order.',
      },
    };
  }

  // Whatever the server marks "included in the buyer total" must actually be in it. Again: two
  // server facts checked against a third server fact; nothing displayed is derived from this.
  const includedFees = feeRows
    .filter((row) => row.includedInBuyerTotal && row.borneBy === 'buyer')
    .reduce((acc, row) => acc + (isZar(row.amount) && wholeCents(row.amount.cents) ? row.amount.cents : Number.NaN), 0);
  if (Number.isNaN(includedFees)) {
    return { ok: false, failure: { code: 'BAD_AMOUNT', detail: 'A fee row carries a bad amount.' } };
  }
  if (order.itemPrice.cents + includedFees !== order.buyerTotal.cents) {
    return {
      ok: false,
      failure: {
        code: 'FEE_TOTAL_MISMATCH',
        detail: 'The fees listed here do not add up to the difference between the item price and the total — this quote is inconsistent.',
      },
    };
  }

  return { ok: true };
}
