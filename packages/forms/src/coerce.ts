/**
 * Value coercion at the field boundary.
 *
 * A DOM input always hands back a string; a schema field usually means a number, a boolean or a
 * list. Coercion happens here, once, so a rule never has to guess whether `"12"` is a string or a
 * number and `form.values.price` means the same thing to the checkout page and to the seller app.
 *
 * Deliberately does not accept `Number(value)` for money: `Number('1 200')` is `NaN` but
 * `Number('1e5')` is 100000 and `Number('0x10')` is 16, so the same "bad" input would be accepted
 * or rejected depending on the string. All numeric coercion goes through the strict parse in
 * `deploit.ts` (SA separators, no hex, no exponent).
 */

import { clean, parseDigits, parseZarAmount, sanitise } from './deploit.js';
import type { FieldValueShape } from './types.js';

export type CoerceKind = 'string' | 'number' | 'integer' | 'money' | 'boolean' | 'csv' | 'digits';

export interface CoerceOptions {
  /** Strip invisibles/controls and normalise spaces. Default true; the only safe default. */
  readonly sanitise?: boolean | undefined;
  readonly multiline?: boolean | undefined;
  /** For `csv`: what to split on. Default `,` and `;`. */
  readonly separators?: readonly string[] | undefined;
}

export interface Coerced<V = FieldValueShape> {
  readonly value: V;
  /** Set when the raw text did not match the requested kind; validation then reports the parse. */
  readonly failed?: 'not_a_number' | 'negative' | 'too_precise' | 'empty' | undefined;
}

export function coerce(raw: unknown, kind: CoerceKind, opts: CoerceOptions = {}): Coerced {
  const shouldSanitise = opts.sanitise !== false;

  if (raw === null || raw === undefined) {
    if (kind === 'boolean') return { value: false };
    if (kind === 'csv') return { value: [] };
    if (kind === 'number' || kind === 'integer' || kind === 'money') return { value: undefined };
    return { value: '' };
  }

  if (kind === 'boolean') {
    if (typeof raw === 'boolean') return { value: raw };
    const text = String(raw).trim().toLowerCase();
    // A DOM checkbox is `on`/absent; a URL param is `1`/`true`; the PHP ledger sends `Y`/`N`.
    return { value: text === 'true' || text === '1' || text === 'on' || text === 'y' || raw === 1 };
  }

  if (kind === 'csv') {
    const separators = opts.separators ?? [',', ';'];
    const source = Array.isArray(raw) ? raw.map((r) => String(r)) : [shouldSanitise ? clean(String(raw)) : String(raw)];
    const parts: string[] = [];
    for (const chunk of source) {
      let pieces = [chunk];
      for (const sep of separators) pieces = pieces.flatMap((p) => p.split(sep));
      for (const piece of pieces) {
        const trimmed = (shouldSanitise ? clean(piece) : piece).trim();
        if (trimmed !== '') parts.push(trimmed);
      }
    }
    return { value: parts };
  }

  if (kind === 'digits') {
    const digits = parseDigits(String(raw));
    return { value: digits ?? '' };
  }

  const text = shouldSanitise ? clean(String(raw), { multiline: opts.multiline }) : String(raw);

  if (kind === 'string') return { value: text };

  if (kind === 'money') {
    if (/^R?\s*-/.test(text.trim())) return { value: undefined, failed: 'negative' };
    const parsed = parseZarAmount(text);
    if (!parsed.ok) return { value: undefined, failed: parsed.reason ?? 'not_a_number' };
    return { value: parsed.cents };
  }

  // number / integer: strict, after separators are normalised.
  const normalised = text.replace(/[\s\u00a0]/g, '').replace(/,/g, '.');
  if (normalised === '') return { value: undefined };
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return { value: undefined, failed: 'not_a_number' };
  const n = Number(normalised);
  if (!Number.isFinite(n)) return { value: undefined, failed: 'not_a_number' };
  if (kind === 'integer' && !Number.isInteger(n)) return { value: n, failed: 'not_a_number' };
  return { value: n };
}

/**
 * Coercion for writing back into a DOM input. Money must not come back as `1200.5` cents-scaled;
 * `formatForInput` is the inverse of `coerce(_, 'money')`.
 */
export function centsToInputString(cents: number | undefined): string {
  if (cents === undefined || !Number.isInteger(cents)) return '';
  const rands = Math.floor(cents / 100);
  const rem = cents % 100;
  return rem === 0 ? String(rands) : `${rands}.${String(rem).padStart(2, '0')}`;
}

/** What a rule sees, always. Keeps `undefined` (never filled) distinct from `''` (cleared). */
export function asString(value: FieldValueShape): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export function sanitiseValue(value: FieldValueShape, multiline = false): { value: FieldValueShape; report: ReturnType<typeof sanitise> | undefined } {
  if (typeof value !== 'string') return { value, report: undefined };
  const report = sanitise(value, { multiline });
  return { value: report.value, report };
}
