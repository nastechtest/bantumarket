/**
 * Unit / measurement formatting.
 *
 * The pilot category is pre-owned watches, so the measurements that show up on a listing are case
 * diameter (mm), weight (g), water resistance (m) and distance-to-buyer (km). The number is rendered
 * with the locale's separators (a space-grouped comma decimal for Afrikaans), while the unit symbol
 * stays the SI form — `mm`/`g`/`km` are not translated, and neither is `R`. There is no plural to
 * agree here: a unit symbol is invariant ("5 kg", not "5 kgs"), which is why this does not route
 * through `Plural`.
 */

import type { Locale } from '../locale.js';
import { formatNumber } from './number.js';

/** SI symbols we render for a listing. Kept tiny and honest: only units the product actually uses. */
export type UnitSymbol = 'mm' | 'cm' | 'g' | 'kg' | 'm' | 'km';

const UNITS: Readonly<Record<UnitSymbol, true>> = {
  mm: true, cm: true, g: true, kg: true, m: true, km: true,
};

export function isUnitSymbol(value: string): value is UnitSymbol {
  return value in UNITS;
}

export interface FormatUnitOptions {
  /** Fixed decimal places (e.g. watch case diameter is stated to one: `42,0 mm`). */
  readonly fractionDigits?: number;
}

/** `formatUnit(42, 'mm', 'af')` → `42 mm`; `formatUnit(1250, 'g', 'af')` → `1 250 g`. */
export function formatUnit(value: number, unit: UnitSymbol, locale: Locale, options: FormatUnitOptions = {}): string {
  const number = options.fractionDigits !== undefined
    ? formatNumber(value, locale, { fractionDigits: options.fractionDigits })
    : formatNumber(value, locale);
  return `${number} ${unit}`;
}

/** Convenience: a watch-style size from a diameter in millimetres, one decimal place. */
export function formatCaseSize(diameterMm: number, locale: Locale): string {
  return formatUnit(diameterMm, 'mm', locale, { fractionDigits: 1 });
}
