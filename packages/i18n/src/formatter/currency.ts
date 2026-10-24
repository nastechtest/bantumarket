/**
 * ZAR currency formatting.
 *
 * Two hard rules, both earned:
 *   1. It consumes `Cents` (the branded integer) or `Money` — never a float. Rand and cents must not
 *      mix in one variable (the ledger's whole argument), so a fractional cent is a bug at the type
 *      boundary and is rejected here rather than rounded away into a wrong amount.
 *   2. The separators are locale-correct, not one-size-fits-all. en-ZA reads `R1,250.00`; Afrikaans
 *      (and isiZulu / isiXhosa) read `R1 250,00` — space thousands grouping, comma decimal. That is
 *      how South Africans actually read a price; `Intl` for `en-ZA` would give the *other* form, so,
 *      as in `formatter/number.ts`, grouping is done by hand.
 *
 * The negative sign is placed before the `R` (`-R4,200.00`), matching `design-system/format.ts`, so
 * refund/adjustment rows on the seller statement line up and read as a subtraction.
 */

import type { Cents, Money } from '@nastech/api-contracts';
import type { Locale } from '../locale.js';
import { NUMBER_SEPARATORS } from './number.js';

const GROUPING_RE = /\B(?=(\d{3})+(?!\d))/g;

/** Either the branded cent count or a full `Money`; both are whole-cents by contract. */
export type CurrencyValue = Cents | Money;

export interface FormatCurrencyOptions {
  /** Render the accounting form for negatives, `(R1 250,00)`, instead of a leading minus. */
  readonly accountingNegative?: boolean;
}

function centsOf(value: CurrencyValue): number {
  // `Money` is an object, `Cents` is a branded number; the brand is erased at runtime so we check shape.
  const cents = typeof value === 'number' ? value : value.cents;
  if (!Number.isInteger(cents)) {
    throw new TypeError(`formatCurrency: cent amount must be a whole integer, got ${cents}`);
  }
  return cents;
}

function group(intDigits: string, groupSep: string): string {
  return groupSep ? intDigits.replace(GROUPING_RE, groupSep) : intDigits;
}

/**
 * Format a ZAR amount for `locale`. `R1 250,00` (af/zu/xh) / `R1,250.00` (en). Always two decimal
 * digits — a marketplace price is stated to the cent, and dropping `.00` reads as an approximation.
 */
export function formatCurrency(value: CurrencyValue, locale: Locale, options: FormatCurrencyOptions = {}): string {
  const cents = centsOf(value);
  const { group: groupSep, decimal } = NUMBER_SEPARATORS[locale];

  const negative = cents < 0;
  const abs = Math.abs(cents);
  const rand = Math.floor(abs / 100);
  const remainder = abs % 100;
  const body = `R${group(String(rand), groupSep)}${decimal}${String(remainder).padStart(2, '0')}`;

  if (!negative) return body;
  return options.accountingNegative ? `(${body})` : `-${body}`;
}
