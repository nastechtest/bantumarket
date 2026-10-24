import type { Money } from '@nastech/api-contracts';

/**
 * Currency discipline for every rendered amount. There is no `toRand` helper here on purpose:
 * cents leave this module only through the design system's `MoneyText`, never through arithmetic
 * a component can get wrong.
 */

/**
 * The ledger is single-currency for the pilot (ZAR only — `SharedKernel\Money` carries its currency
 * on every row). A `Money` claiming another currency is a wire bug; surfacing it at render time
 * beats silently formatting `$4,200` over a rand amount.
 */
export function requireZar(value: Money, where: string): Money {
  if (value.currency !== 'ZAR') {
    throw new Error(`checkout[${where}]: unexpected currency ${value.currency}; the pilot is ZAR-only`);
  }
  return value;
}

/** Whole cents is an invariant of `money()`; re-asserted at render because fixtures can lie. */
export function assertWholeCents(value: Money, where: string): void {
  if (!Number.isInteger(value.cents)) {
    // TypeError: this is a contract violation of the Money brand, not a user-recoverable state.
    throw new TypeError(`checkout[${where}]: fractional cents ${value.cents}`);
  }
}

export function isZar(value: Money): boolean {
  return value.currency === 'ZAR';
}

/** One label for every money field on this screen; a second currency symbol is a defect. */
export const CURRENCY_LABEL = 'ZAR (rand)';
