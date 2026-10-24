/**
 * CLDR cardinal plural categories — the real operand rules, not a `n === 1 ? 'one' : 'many'`.
 *
 * Rules are copied verbatim from the Unicode CLDR `common/supplemental/plurals.xml` (main branch):
 *   en        one = "i = 1 and v = 0"          (else other)
 *   af, xh    one = "n = 1"                     (else other)
 *   zu        one = "i = 0 or n = 1"            (else other)
 *
 * The categories differ per language in ways a naive check gets wrong, and each difference is a
 * test: `1.0` is `other` in English (v != 0) but `one` in Afrikaans/isiXhosa (n = 1); `0` is `one`
 * in isiZulu (i = 0) but `other` everywhere else. Because the operand set can only be computed from
 * the *rendered* form (does the message show "1" or "1.0"?), plural selection takes a string too.
 */

import type { Locale } from './locale.js';

/** The six CLDR cardinal categories. Every locale uses `other` as its final default. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export const PLURAL_CATEGORIES: readonly PluralCategory[] = [
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
];

/**
 * CLDR plural operands. `n` is the whole value, `i` its integer digits, `v` the count of visible
 * fraction digits (WITH trailing zeros), `w` without trailing zeros, `f` the visible fraction as an
 * integer, `t` the fraction without trailing zeros.
 */
export interface PluralOperands {
  readonly n: number;
  readonly i: number;
  readonly v: number;
  readonly w: number;
  readonly f: number;
  readonly t: number;
}

/**
 * Derive the operands from a number or its *displayed* string form. A number gives its default
 * rendering (so 1 has v=0 but 1.0, passed as the string "1.0", has v=1) — that distinction is the
 * whole reason the English and Afrikaans rules diverge on 1.0.
 */
export function pluralOperands(value: number | string): PluralOperands {
  const raw = typeof value === 'number' ? numberToPlainString(value) : value.trim();
  const unsigned = raw.startsWith('-') ? raw.slice(1) : raw;
  const [intPart, fracPart = ''] = splitOnDot(unsigned);
  const i = intPart === '' ? 0 : Number(intPart);
  const v = fracPart.length;
  const trimmedFrac = fracPart.replace(/0+$/, '');
  const w = trimmedFrac.length;
  const f = fracPart === '' ? 0 : Number(fracPart);
  const t = trimmedFrac === '' ? 0 : Number(trimmedFrac);
  const n = Number(unsigned);
  return { n, i, v, w, f, t };
}

function splitOnDot(s: string): [string, string?] {
  const dot = s.indexOf('.');
  if (dot === -1) return [s];
  return [s.slice(0, dot), s.slice(dot + 1)];
}

/** Number → plain decimal string (never exponent form), so `0.0001` keeps its operands. */
function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const s = String(Math.abs(n));
  // Exponential notation (1e-7, 1e21) would silently drop operands; expand it.
  if (!s.includes('e')) return String(n);
  return fixedNotation(n);
}

function fixedNotation(n: number): string {
  // Enough digits to cover the double's round-trippable precision.
  return n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
}

type PluralRule = (o: PluralOperands) => PluralCategory;

/** The four locales that ship with a catalogue. All three use {one, other}; the trigger differs. */
const ENGLISH: PluralRule = (o) => (o.i === 1 && o.v === 0 ? 'one' : 'other');
const AFRIKAANS: PluralRule = (o) => (o.n === 1 ? 'one' : 'other');
const ISIXHOSA: PluralRule = AFRIKAANS; // xh shares the af/…/xh CLDR block: `n = 1`.
const ISIZULU: PluralRule = (o) => (o.i === 0 || o.n === 1 ? 'one' : 'other');

const RULES: Readonly<Record<Locale, PluralRule>> = {
  en: ENGLISH,
  af: AFRIKAANS,
  xh: ISIXHOSA,
  zu: ISIZULU,
};

/**
 * `Plural` is the public surface the brief names. It resolves a value to a CLDR category for a
 * locale, and reports which categories a locale can actually produce so a message author knows
 * which forms to write — `categoriesFor('zu')` and `categoriesFor('en')` are both {one, other}, but
 * a language like Arabic would report {zero, one, two, few, many, other}.
 */
export interface Plural {
  select(locale: Locale, value: number | string): PluralCategory;
  categoriesFor(locale: Locale): readonly PluralCategory[];
}

function categoriesFor(rule: PluralRule): readonly PluralCategory[] {
  // A cardinal rule for these four only ever returns one/other; derive it rather than hard-code it,
  // so if a richer rule is added the reported set follows automatically.
  const seen = new Set<PluralCategory>();
  for (const probe of [0, 1, 1.0, 1.5, 2, 3, 5, 10, 100, '0', '1.0', '0.5']) {
    seen.add(rule(pluralOperands(probe)));
  }
  return PLURAL_CATEGORIES.filter((c) => seen.has(c));
}

export const Plural: Plural = {
  select(locale, value) {
    const rule = RULES[locale];
    if (!rule) return 'other'; // Unruled locale: CLDR's mandated final default.
    return rule(pluralOperands(value));
  },
  categoriesFor(locale) {
    const rule = RULES[locale];
    if (!rule) return ['other'];
    return categoriesFor(rule);
  },
};

/** Function form for callers (icu.ts) that already hold a locale and want the category directly. */
export function pluralCategory(locale: Locale, value: number | string): PluralCategory {
  return Plural.select(locale, value);
}
