import { money as toMoney } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';

/**
 * ZAR display formatting, single source for the frontend.
 *
 * Deliberately not Intl: the pilot ships on Node 18 with variable ICU builds and en-ZA formats
 * with space grouping and comma decimals ("R 4 200,00"), which is not what the brief's tests fix
 * (`R4,200`). Manual grouping is deterministic everywhere and cheaper than the ICU first-paint
 * cost we are not spending on money.
 */

const GROUPING_RE = /\B(?=(\d{3})+(?!\d))/g;

function amount(cents: number): string {
  const abs = Math.abs(cents);
  const rand = Math.floor(abs / 100);
  const remainder = abs % 100;
  const grouped = String(rand).replace(GROUPING_RE, ',');
  return remainder === 0 ? `R${grouped}` : `R${grouped}.${String(remainder).padStart(2, '0')}`;
}

/** `R4,200` for whole rand, `R1,234.56` with cents, `-R4,200` when negative. */
export function formatZar(value: Money): string {
  const body = amount(value.cents);
  return value.cents < 0 ? `-${body}` : body;
}

/** Convenience for unbranded cent values; goes through the contract's `money()` constructor. */
export function formatCents(cents: number): string {
  return formatZar(toMoney(cents));
}

/**
 * Seller statements render a refund as `(R4,200)`, the accounting form, rather than a leading
 * minus. The minus survives copy-paste into a calculator and reads as a subtraction; parentheses
 * read as "this line moved money back".
 */
export function formatZarRefunded(value: Money): string {
  return value.cents < 0 ? `(${amount(value.cents)})` : formatZar(value);
}
