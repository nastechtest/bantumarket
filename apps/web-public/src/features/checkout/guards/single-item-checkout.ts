/**
 * Single-item checkout guard.
 *
 * The pilot sells one item per order: `CreateOrder.php` ties an order to exactly one listing and
 * copies that listing's price onto the order — there is no multi-line cart anywhere in the ledger,
 * and a buyer-side "total" that quietly bundled two listings would have no server counterpart to
 * answer a dispute with. If the wire ever carries more than one line (or a quantity above 1),
 * this checkout refuses rather than renders a number the ledger cannot honour.
 */

import type { CheckoutView } from '../api/checkout-transport.js';

export type SingleItemFailure = { code: 'MULTI_ITEM_NOT_SUPPORTED'; detail: string };

export function checkSingleItem(view: CheckoutView): { ok: true } | { ok: false; failure: SingleItemFailure } {
  if (view.items.length !== 1) {
    return {
      ok: false,
      failure: {
        code: 'MULTI_ITEM_NOT_SUPPORTED',
        detail: `This checkout covers one item at a time; this view carries ${String(view.items.length)} lines.`,
      },
    };
  }
  const item = view.items[0];
  if (item === undefined || item.quantity !== 1) {
    return {
      ok: false,
      failure: {
        code: 'MULTI_ITEM_NOT_SUPPORTED',
        detail: 'This checkout covers one quantity of one item; the ledger cannot price anything else.',
      },
    };
  }
  if (item.listingId !== view.listingId) {
    return {
      ok: false,
      failure: {
        code: 'MULTI_ITEM_NOT_SUPPORTED',
        detail: 'A line item names a listing other than the one this order was created for.',
      },
    };
  }
  return { ok: true };
}
