/**
 * Locale-aware number formatting.
 *
 * Manual grouping, not `Intl.NumberFormat`. Node 18's ICU builds vary and, for `en-ZA` specifically,
 * would group with a space and use a comma decimal ("1 250,00") — the opposite of the `R1,250.00`
 * the brief fixes for English ZA. Deterministic grouping also costs nothing at first paint. This is
 * the shared primitive: `formatter/currency.ts` groups the rand amount with it, and `icu.ts` renders
 * `#` and numeric arguments through it, so the separator table lives in exactly one place.
 *
 * The separator table encodes the South African convention the brief requires: English (the working
 * language of the listing) keeps the anglophone comma-group / dot-decimal form, while Afrikaans and
 * the two Nguni languages use space grouping and a comma decimal. That is why `R1 250,00` and
 * `R1,250.00` are both correct — they are different locales, not one of them being a bug.
 */

import type { Locale } from '../locale.js';

export interface NumberSeparators {
  readonly group: string;
  readonly decimal: string;
}

/**
 * Declared as a literal and checked with `satisfies`, so the table stays total over `Locale` while
 * indexing it by a locale stays non-optional — no `?? default` that would quietly format a new
 * locale with the wrong separators.
 */
export const NUMBER_SEPARATORS = {
  en: { group: ',', decimal: '.' },
  af: { group: ' ', decimal: ',' },
  zu: { group: ' ', decimal: ',' },
  xh: { group: ' ', decimal: ',' },
} as const satisfies Record<Locale, NumberSeparators>;

export interface FormatNumberOptions {
  /** Fixed fraction digits; when set, both min and max are forced to it. */
  readonly fractionDigits?: number;
  /** Suppress thousands grouping (e.g. for a phone or an id, which are not quantities). */
  readonly useGrouping?: boolean;
}

const GROUPING_RE = /\B(?=(\d{3})+(?!\d))/g;

function splitFixed(value: number, fractionDigits: number): { readonly intPart: string; readonly fracPart: string } {
  // toFixed rounds half-to-even at the JS engine level and never yields exponent form for our magnitudes.
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const dot = fixed.indexOf('.');
  const intPart = dot === -1 ? fixed : fixed.slice(0, dot);
  const fracPart = dot === -1 ? '' : fixed.slice(dot + 1);
  return { intPart, fracPart };
}

/**
 * Format a plain number for `locale`. Fraction digits default to "as many as the value carries, up to
 * 3"; callers that need an exact width (currency: always 2) pass `fractionDigits`.
 */
export function formatNumber(value: number, locale: Locale, options: FormatNumberOptions = {}): string {
  if (!Number.isFinite(value)) return String(value);
  const { group, decimal } = NUMBER_SEPARATORS[locale];
  const useGrouping = options.useGrouping ?? true;
  const fractionDigits = options.fractionDigits ?? defaultFractionDigits(value);

  const { intPart, fracPart } = splitFixed(value, fractionDigits);
  const groupedInt = useGrouping && group ? intPart.replace(GROUPING_RE, group) : intPart;
  const body = fractionDigits > 0 ? `${groupedInt}${decimal}${fracPart}` : groupedInt;
  return value < 0 ? `-${body}` : body;
}

function defaultFractionDigits(value: number): number {
  const s = String(Math.abs(value));
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  // Drop trailing zeros, then cap at 3 — mirrors the "#,##0.###" CLDR decimal pattern.
  return Math.min(s.slice(dot + 1).replace(/0+$/, '').length, 3);
}
