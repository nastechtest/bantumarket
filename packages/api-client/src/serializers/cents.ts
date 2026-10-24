/**
 * Cents: the money boundary of the client, and the one place a float is refused rather than fixed.
 *
 * The backend is unambiguous about this. `SharedKernel/Money.php` opens with "Money is a value
 * object over integer cents. Never a float", holds `int $cents`, and keeps `nonzero_cents` /
 * `positive_cents` as PostgreSQL domains so a rogue writer is refused by storage. `WebhookEvent`
 * goes as far as to say that an amount arriving as the string `"1299.9"` must not quietly become
 * R1299.09 or R12 999.00 in someone's arithmetic.
 *
 * So this module does not round. Rounding `12.5` to `13` in a field that carries cents is a
 * different amount of money, and the ledger's commit-time invariants (`MoneyInvariants.php`) only
 * mean something if the number the client shows the buyer is the number the ledger booked. A float
 * in a cents field is a wire bug, it is raised as one, and it escapes every `catch (ApiError)` so a
 * UI cannot render it as a price at all.
 */

import type { Cents, Money } from '@nastech/api-contracts';
import { contractViolation } from '../http/errors.js';

/** Above this, `Number.isInteger` is a lie: the double cannot represent the cent. */
export const MAX_SAFE_CENTS: number = Number.MAX_SAFE_INTEGER;

/** Currency is single-value at launch (`shared.rand_currency` CHECK: `VALUE = 'ZAR'`). */
export const SUPPORTED_CURRENCY = 'ZAR';

/** Wire spellings of a cents field: `cents`, `price_cents`, `priceCents`, `held_cents`. */
const CENTS_FIELD_NAME = /(?:^|_)[a-z0-9]*cents$/i;

export function isCentsFieldName(key: string): boolean {
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return CENTS_FIELD_NAME.test(snake) || snake === 'cents';
}

/**
 * Parse a value that must be whole cents. Accepts an integer number or an integer-formatted string
 * (a `bigint` column is sometimes encoded as a string by a JSON layer); rejects everything else,
 * including `12.5`, `"12.50"`, `true`, `null`, `NaN`, `Infinity`, and any value that cannot be
 * represented exactly.
 */
export function parseCents(value: unknown, field: string): Cents {
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw contractViolation('out_of_range', field, value, 'a finite whole number of cents');
    }
    if (!Number.isInteger(value)) {
      throw contractViolation('money_precision', field, value, 'whole integer cents (never a float)');
    }
    return assertInRange(value, field);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      if (!Number.isFinite(asNumber) || !Number.isInteger(asNumber)) {
        throw contractViolation('out_of_range', field, trimmed, 'cents representable exactly as a JS number');
      }
      return assertInRange(asNumber, field);
    }
    if (/^-?\d*\.\d+$/.test(trimmed)) {
      throw contractViolation('money_precision', field, trimmed, 'whole integer cents (never a decimal string)');
    }
    throw contractViolation('unexpected_shape', field, trimmed, 'an integer cents value');
  }

  throw contractViolation('unexpected_shape', field, value, 'an integer cents value');
}

function assertInRange(value: number, field: string): Cents {
  if (Math.abs(value) > MAX_SAFE_CENTS) {
    throw contractViolation('out_of_range', field, value, `|cents| <= ${MAX_SAFE_CENTS}`);
  }
  return value as Cents;
}

/** `Money` as the contract defines it: branded cents plus the one supported currency. */
export function moneyFromWire(value: unknown, field: string): Money {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw contractViolation('unexpected_shape', field, value, 'a { cents, currency } object');
  }
  const record = value as Record<string, unknown>;
  if (!('cents' in record)) {
    // A bare `{ price: 1299 }` or a `{ price_cents: 129900 }` flattened out of the object form is
    // the shape a hand-written handler tends to produce; both are refused, not coerced.
    throw contractViolation('unexpected_shape', field, Object.keys(record).join(','), 'a { cents, currency } object');
  }
  const cents = parseCents(record['cents'], `${field}.cents`);
  const currency = record['currency'];
  if (typeof currency !== 'string') {
    throw contractViolation('unexpected_shape', `${field}.currency`, currency, `'${SUPPORTED_CURRENCY}'`);
  }
  if (currency.toUpperCase() !== SUPPORTED_CURRENCY) {
    // `shared.rand_currency` refuses this at the domain level; a client that accepted it would show
    // a price in a currency the pilot cannot settle in.
    throw contractViolation('unsupported_currency', `${field}.currency`, currency, SUPPORTED_CURRENCY);
  }
  return { cents, currency: SUPPORTED_CURRENCY };
}

export function moneyToWire(amount: Money): { readonly cents: number; readonly currency: string } {
  // Guard on the way out too: a caller that built a `Money` by casting rather than by
  // `money()` must not get a float into a POST body.
  const cents = parseCents(amount.cents, 'body.cents');
  return { cents, currency: amount.currency };
}

/**
 * Display form mirroring `Money::toRandString()`: a space as the thousands separator, exactly two
 * decimals, sign preserved. `amount % 100` is taken on the absolute value, which is what makes
 * -1234 cents `-12.34` rather than `-12.-34`.
 */
export function centsToRandString(value: number): string {
  const cents = parseCents(value, 'display.cents');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${groupThousands(whole)}.${String(frac).padStart(2, '0')}`;
}

function groupThousands(value: number): string {
  return Math.trunc(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Decimal rand string to cents, mirroring `Money::fromRand()` exactly: `^-?\d+(\.\d{1,2})?$` is
 * accepted, anything with three decimals or a stray character is refused, and the conversion is
 * done on the digits rather than by multiplying a float by 100 (which is how 1299.9 becomes
 * 129899.99999 in binary).
 */
export function randStringToCents(rand: string): Cents {
  const trimmed = rand.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw contractViolation('unexpected_shape', 'rand', trimmed, 'a decimal rand string with at most 2 decimals');
  }
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [wholeRaw = '0', fracRaw = ''] = abs.split('.', 2);
  const frac = fracRaw.padEnd(2, '0').slice(0, 2);
  const whole = Number(wholeRaw);
  if (!Number.isInteger(whole) || whole > Math.floor(MAX_SAFE_CENTS / 100)) {
    throw contractViolation('out_of_range', 'rand', trimmed, 'an amount inside the safe cents range');
  }
  const cents = whole * 100 + Number(frac);
  return (negative ? -cents : cents) as Cents;
}

/** Exact addition of cents. Any non-integer in the list fails the whole sum rather than half of it. */
export function sumCents(values: readonly number[], field = 'sum.cents'): Cents {
  let total = 0;
  for (const [index, value] of values.entries()) {
    total += parseCents(value, `${field}[${index}]`);
  }
  return assertInRange(total, field);
}

/**
 * Walk a response (or an outgoing body) and reject any cents-shaped field that is not whole,
 * anywhere in nested objects and arrays. This is what makes "cents correctness" a property of the
 * layer rather than a property of whoever remembered to call `parseCents` for one field.
 */
export function assertCentsIntegrity(value: unknown, path = 'body', seen = new Set<unknown>()): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return; // a cyclic structure cannot be a wire payload; stop rather than recurse
  seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) assertCentsIntegrity(entry, `${path}[${index}]`, seen);
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (isCentsFieldName(key)) {
      // Parse for the check: the throw is the point, the branded return value is discarded.
      parseCents(entry, childPath);
      continue;
    }
    assertCentsIntegrity(entry, childPath, seen);
  }
}

export function parseCentsField(value: unknown, field: string): Cents {
  return parseCents(value, field);
}

function basename(field: string): string {
  const dot = field.lastIndexOf('.');
  return dot === -1 ? field : field.slice(dot + 1);
}
