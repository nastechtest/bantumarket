/**
 * ZAR rendering for two audiences that must not be conflated:
 *  - `zarMajorMinor` feeds JSON-LD, which wants a machine decimal ("4200.00");
 *  - `zarDisplay` is a human fallback when design-system's `MoneyText` is not in the tree.
 * Both are integer arithmetic. A `cents / 100` division anywhere near money is how float noise
 * enters a price, and the ledger's argument (see @nastech/api-contracts `money()`) is that cents
 * and rand never mix in one variable.
 */

import type { Money } from '@nastech/api-contracts';

/** "4200.00" from 420_000 cents. Throws on negative — a listing price is never negative, and
 * silently emitting "-4200.00" into a Product schema is how a bug becomes an offer. */
export function zarMajorMinor(value: Money): string {
  const cents = value.cents;
  if (cents < 0) throw new RangeError('listing prices cannot be negative');
  const major = Math.floor(cents / 100);
  const minor = cents % 100;
  return `${major}.${String(minor).padStart(2, '0')}`;
}

/** "R4,200" / "R1,234.56" — matches design-system `formatZar` output; keep design-system as the
 * on-screen path and this only for surfaces (title tags) that cannot render a component. */
export function zarDisplay(value: Money): string {
  const abs = Math.abs(value.cents);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const grouped = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = minor === 0 ? `R${grouped}` : `R${grouped}.${String(minor).padStart(2, '0')}`;
  return value.cents < 0 ? `-${body}` : body;
}
