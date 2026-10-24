import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';

/**
 * The only pricing the seller app may show. These are the pilot's real numbers: a 3D capture
 * costs R270, the seller success fee is 0 %, and at that fee a capture pays for itself once an
 * item clears R2,700. Nothing here is derived from a live quote, so a screen that needs a price
 * imports this module instead of typing a number into copy.
 */
export const CAPTURE_PRICE_CENTS = 27_000;
export const CAPTURE_BREAK_EVEN_CENTS = 270_000;
export const SELLER_FEE_BASIS_POINTS = 0;

export const CAPTURE_PRICE: Money = money(CAPTURE_PRICE_CENTS);
export const CAPTURE_BREAK_EVEN: Money = money(CAPTURE_BREAK_EVEN_CENTS);

/** `0` — basis points are the storage form; this is the display form. */
export const SELLER_FEE_PERCENT = SELLER_FEE_BASIS_POINTS / 100;

export function sellerFeePercentLabel(): string {
  return `${SELLER_FEE_PERCENT}%`;
}
