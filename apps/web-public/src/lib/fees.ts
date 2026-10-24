/**
 * The pilot's fee facts, in integer cents, shared by the public fee surfaces.
 *
 * One number per fact so the help centre and the selling landing page cannot disagree with the
 * fees policy. The success fee is charged only when an order reaches COMPLETED; the listing fee
 * is zero. `formatCents` is the only display formatter, so every rand amount on those pages is
 * the same integer the ledger would book.
 */

export const LISTING_FEE_BASIS_POINTS = 0;
export const SUCCESS_FEE_BASIS_POINTS = 1000;
export const CAPTURE_COST_CENTS = 27_000;

/** The fixture sale used in the public examples: a R4,200 watch. */
export const EXAMPLE_SALE_PRICE_CENTS = 420_000;

export function feeForSaleCents(priceCents: number, basisPoints: number = SUCCESS_FEE_BASIS_POINTS): number {
  if (!Number.isInteger(priceCents)) throw new TypeError(`Sale price must be whole cents, got ${priceCents}`);
  return Math.round((priceCents * basisPoints) / 10_000);
}

/** A capture pays for itself once the success fee on the completed sale reaches its R270 cost. */
export function captureBreakEvenCents(basisPoints: number = SUCCESS_FEE_BASIS_POINTS): number {
  if (basisPoints <= 0) throw new RangeError('break-even needs a positive success-fee rate');
  return Math.ceil((CAPTURE_COST_CENTS * 10_000) / basisPoints);
}

export const EXAMPLE_SUCCESS_FEE_CENTS = feeForSaleCents(EXAMPLE_SALE_PRICE_CENTS);
export const EXAMPLE_PAYOUT_CENTS = EXAMPLE_SALE_PRICE_CENTS - EXAMPLE_SUCCESS_FEE_CENTS;
export const CAPTURE_BREAK_EVEN_CENTS = captureBreakEvenCents();
