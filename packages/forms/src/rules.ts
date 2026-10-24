/**
 * The rule set. One implementation of "is this input acceptable", shared by all three apps.
 *
 * Rules return a `RuleResult` (code + params) or null. They never return prose and never throw.
 * A rule that cannot see its siblings takes `get` for the whole value map, which is how
 * `confirmPassword` and `priceRange` work without a form-level escape hatch.
 *
 * `expensive: true` on a result means "do not run this per keystroke" — see `when-to-validate.ts`.
 * Every rule here is cheap except `password.common`, which is marked expensive because the denylist
 * it will eventually call is remote; the seam is in the result, not in the caller's head.
 */

import { clean, parseZarAmount, sanitise } from './deploit.js';
import { scanConfusables } from './text.js';
import type { FieldRule, FieldValueShape, IssueLevel, IssueParams, RuleResult } from './types.js';

function fail(
  code: string,
  params?: IssueParams | undefined,
  extra?: { level?: IssueLevel | undefined; expensive?: boolean | undefined },
): RuleResult {
  return { kind: 'fail', code, params, ...extra };
}

const PASS: RuleResult = { kind: 'pass' };

function isEmpty(value: FieldValueShape): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Character count in graphemes where the runtime has them, code points otherwise. */
const GraphemeSegmenter = (Intl as unknown as {
  Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment(text: string): Iterable<unknown> };
}).Segmenter;

export function countCharacters(text: string): number {
  if (GraphemeSegmenter) {
    let n = 0;
    for (const _ of new GraphemeSegmenter('en', { granularity: 'grapheme' }).segment(text)) n += 1;
    return n;
  }
  return Array.from(text).length;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Length in *visible* characters, after invisibles are stripped. A title of 80 `.` plus a zero-width
 * character is not a 120-character title; counting the junk would let a padded string through.
 */
function visibleLength(value: string, multiline: boolean): number {
  return countCharacters(clean(value, { multiline }));
}

// ── required ───────────────────────────────────────────────────────────────────────────────────

export interface RequiredOptions {
  /** Trim-aware (default). A field of three spaces is not an answer. */
  readonly treatWhitespaceAsEmpty?: boolean | undefined;
  /** For checkboxes (consent): `false` fails too, not just `undefined`. */
  readonly rejectFalse?: boolean | undefined;
}

export function required(options: RequiredOptions = {}): FieldRule {
  const whitespaceEmpty = options.treatWhitespaceAsEmpty !== false;
  return (value) => {
    if (isEmpty(value)) return fail('validation.required');
    if (typeof value === 'boolean') {
      if (value === false && options.rejectFalse === true) return fail('validation.required');
      return PASS;
    }
    if (typeof value === 'string') {
      const text = whitespaceEmpty ? value.trim() : value;
      if (text === '') return fail('validation.required');
    }
    return PASS;
  };
}

// ── optional-text ──────────────────────────────────────────────────────────────────────────────

export interface OptionalTextOptions {
  readonly minLength?: number | undefined;
  readonly maxLength?: number | undefined;
  readonly maxWords?: number | undefined;
  readonly multiline?: boolean | undefined;
  /**
   * Reject bidi/zero-width content rather than only flagging it. On for anything the dispute process
   * reads (title, description) — the text is the evidence, so evidence with hidden characters in it
   * is not usable. Off lets `deploit`'s flag reach review without blocking the seller.
   */
  readonly blockInvisible?: boolean | undefined;
}

export function optionalText(options: OptionalTextOptions = {}): FieldRule {
  return (value) => {
    if (isEmpty(value)) return PASS;
    const raw = String(value);
    const text = options.multiline ? raw.replace(/\r/g, '') : raw;
    const visible = visibleLength(text, options.multiline === true);

    if (options.minLength !== undefined && visible < options.minLength) {
      return fail('validation.text.length', { min: options.minLength, actual: visible, unit: 'characters' });
    }
    if (options.maxLength !== undefined && visible > options.maxLength) {
      return fail('validation.text.length', { max: options.maxLength, actual: visible, unit: 'characters' });
    }
    if (options.maxWords !== undefined && countWords(clean(text, { multiline: options.multiline })) > options.maxWords) {
      return fail('validation.text.max_words', { max: options.maxWords });
    }

    const report = sanitise(text, { multiline: options.multiline === true });
    const blocking = report.issues.filter((i) => i.code !== 'security.nbsp');
    if (options.blockInvisible === true && blocking.length > 0) {
      const first = blocking[0]!;
      return fail(first.code, { ...first.params, level: 'error' });
    }
    if (blocking.length > 0) {
      const first = blocking[0]!;
      // Not a pass: the field is fillable but the value needs a human look before it goes live.
      return fail(first.code, first.params, { level: 'warning' });
    }
    return PASS;
  };
}

// ── email ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Pragmatic email check. Not RFC 5322 — that grammar accepts comments and quoted spaces that no
 * delivery system supports, and a rule with a 400-character regex is a rule nobody will fix.
 *
 * The local part is limited to 64 and the domain must have at least one dot with a 2+ character
 * last label, because a scam address that actually gets typed is `paypal@support.com`, not
 * `a@b`.
 */
const EMAIL_LOCAL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function email(): FieldRule {
  return (value) => {
    if (isEmpty(value)) return PASS;
    const report = sanitise(String(value), { wholeStringConfusables: true });
    const text = report.value;
    if (report.issues.some((i) => i.code === 'security.zero_width' || i.code === 'security.homoglyph_prefix')) {
      // Before the syntax check: `gm​ail.com` is a *valid* email and a fake one.
      const first = report.issues.find((i) => i.code !== 'security.nbsp');
      return fail(first ? first.code : 'security.control_chars', first?.params);
    }
    if (text.length > 254) return fail('validation.email.local_too_long', { max: 254, actual: text.length });
    const at = text.lastIndexOf('@');
    if (at <= 0 || at === text.length - 1) return fail('validation.email.invalid', { value: text });
    const local = text.slice(0, at);
    const domain = text.slice(at + 1);
    if (!EMAIL_LOCAL.test(local) || local.length > 64) {
      return fail('validation.email.local_too_long', { max: 64, actual: local.length });
    }
    if (domain.startsWith('[') || domain.endsWith('.')) return fail('validation.email.invalid', { value: text });
    const labels = domain.split('.');
    if (labels.length < 2 || labels.some((l) => !EMAIL_DOMAIN_LABEL.test(l))) {
      return fail('validation.email.invalid', { value: text });
    }
    const tld = labels[labels.length - 1]!;
    if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return fail('validation.email.invalid', { value: text });
    return PASS;
  };
}

// ── ZA phone ───────────────────────────────────────────────────────────────────────────────────

/**
 * South African numbers. Local form `0XX XXX XXXX` (10 digits starting 0), international `+27`
 * (9 digits after the country code). `0860...` and `08600...` premium rates are accepted — the form
 * is not the place to encode a cost policy, and rejecting them silently loses a real seller.
 */
export function zaPhone(): FieldRule {
  return (value) => {
    if (isEmpty(value)) return PASS;
    const raw = String(value);
    const text = clean(raw);
    const digits = text.replace(/\D/g, '');
    const hadPlus = /^\s*\+/.test(text);
    if (digits === '') return fail('validation.phone.za.invalid', { value: raw });

    let national = digits;
    if (hadPlus) {
      if (!digits.startsWith('27')) {
        return fail('validation.phone.za.country_code', { value: raw, digits: digits.length });
      }
      national = digits.slice(2);
      if (national.startsWith('0')) return fail('validation.phone.za.country_code', { value: raw });
    } else if (digits.startsWith('27') && digits.length === 11) {
      // `27 82 555 1234` without the plus is how a WhatsApp paste arrives.
      national = digits.slice(2);
    } else if (!digits.startsWith('0')) {
      return fail('validation.phone.za.invalid', { value: raw, digits: digits.length });
    } else {
      national = digits.slice(1);
    }

    if (national.length !== 9) return fail('validation.phone.za.invalid', { value: raw, digits: national.length });
    // 1x-5x geographic, 6x/7x mobile, 8x premium & non-geographic. 9x is unassigned.
    if (!/^[1-8]\d{8}$/.test(national)) {
      return fail('validation.phone.za.invalid', { value: raw, digits: national.length });
    }
    return PASS;
  };
}

// ── password ───────────────────────────────────────────────────────────────────────────────────

export interface PasswordOptions {
  readonly minLength?: number | undefined;
  readonly maxLength?: number | undefined;
  /** Required character classes among lower / upper / digit / symbol. Default 2. */
  readonly minCharacterClasses?: number | undefined;
  /** Reject when the password equals another field (name, email) — the classic reuse attack. */
  readonly sameAsFields?: readonly string[] | undefined;
}

const CLASSES = [/[\p{Ll}]/u, /[\p{Lu}]/u, /\d/, /[^A-Za-z0-9\s]/];

export function password(options: PasswordOptions = {}): FieldRule {
  const minLength = options.minLength ?? 10;
  const maxClasses = options.minCharacterClasses ?? 2;
  return (value, get) => {
    if (isEmpty(value)) return PASS;
    const text = String(value);
    // A password is never sanitised: a NBSP in a password is a character the user typed, not junk.
    if (text.length < minLength) {
      return fail('validation.password.length', { min: minLength, actual: text.length, unit: 'characters' });
    }
    if (options.maxLength !== undefined && text.length > options.maxLength) {
      return fail('validation.password.length', { max: options.maxLength, actual: text.length, unit: 'characters' });
    }
    if (/[\u200b-\u200f\u202a-\u202e]/.test(text)) {
      // We must not silently strip it: the account would then have a different password than typed.
      return fail('validation.text.control_chars', {
        codepoints: [...text].filter((c) => /[\u200b-\u200f\u202a-\u202e]/.test(c)).length,
      });
    }
    const classes = CLASSES.filter((re) => re.test(text)).length;
    if (classes < maxClasses) {
      return fail('validation.password.class', { need: maxClasses, have: classes });
    }
    for (const field of options.sameAsFields ?? []) {
      const other = get(field);
      if (typeof other === 'string' && other !== '' && other.toLowerCase() === text.toLowerCase()) {
        return fail('validation.password.same_as_field', { field });
      }
    }
    return PASS;
  };
}

/**
 * Denylist hook. This package cannot reach the network and must not pretend to: `useForm` callers
 * pass their own checker. Marked `expensive` so the timing policy defers it to blur.
 */
export function passwordCommon(checker: (value: string) => boolean): FieldRule {
  return (value) => {
    if (isEmpty(value)) return PASS;
    if (checker(String(value))) {
      return { kind: 'fail', code: 'validation.password.common', expensive: true };
    }
    return { kind: 'pass', expensive: true };
  };
}

// ── price range ────────────────────────────────────────────────────────────────────────────────

export interface PriceRangeOptions {
  /** In cents — the ledger's unit, so no float ever enters a money comparison. */
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly required?: boolean | undefined;
}

export function priceRange(options: PriceRangeOptions = {}): FieldRule {
  return (value) => {
    if (isEmpty(value)) {
      return options.required === true ? fail('validation.required') : PASS;
    }
    const raw = value as string | number;
    if (typeof raw === 'number') {
      if (!Number.isInteger(raw)) return fail('validation.price.format', { value: String(raw) });
      return within(raw, options);
    }
    const parsed = parseZarAmount(String(raw));
    if (!parsed.ok) {
      if (parsed.reason === 'negative') return fail('validation.price.range', { min: 0, actual: -1 });
      return fail('validation.price.format', { value: String(raw) });
    }
    return within(parsed.cents, options);
  };
}

function within(cents: number, options: PriceRangeOptions): RuleResult {
  if (options.min !== undefined && cents < options.min) {
    return fail('validation.price.min', { min: options.min, actual: cents, unit: 'rands' });
  }
  if (options.max !== undefined && cents > options.max) {
    return fail('validation.price.max', { max: options.max, actual: cents, unit: 'rands' });
  }
  return PASS;
}

// ── ZA postcode ────────────────────────────────────────────────────────────────────────────────

/** Four digits, `^[0-9]{4}$` after cleaning. Not the 5-digit US shape; that is the common mistake. */
export function postcode(): FieldRule {
  return (value) => {
    if (isEmpty(value)) return PASS;
    const digits = clean(String(value)).replace(/\D/g, '');
    if (!/^\d{4}$/.test(digits)) {
      return fail('validation.postcode.za.invalid', { value: String(value), digits: digits.length });
    }
    if (/^(\d)\1{3}$/.test(digits)) return fail('validation.postcode.za.invalid', { value: String(value) });
    return PASS;
  };
}

// ── one-of / match / quantity ──────────────────────────────────────────────────────────────────

export function oneOf(allowed: readonly (string | number)[]): FieldRule {
  return (value) => {
    if (isEmpty(value)) return PASS;
    const text = String(value);
    if (!allowed.map(String).includes(text)) {
      return fail('validation.one_of', { options: allowed.map(String), value: text });
    }
    return PASS;
  };
}

/** Confirm-password and confirm-email: two fields must agree, case-sensitively for passwords. */
export function matches(otherField: string, opts?: { caseInsensitive?: boolean }): FieldRule {
  return (value, get) => {
    if (isEmpty(value)) return PASS;
    const other = get(otherField);
    if (other === undefined || other === null || other === '') return PASS;
    const a = String(value);
    const b = String(other);
    const equal = opts?.caseInsensitive === true ? a.toLowerCase() === b.toLowerCase() : a === b;
    return equal ? PASS : fail('validation.match', { field: otherField });
  };
}

export interface QuantityOptions {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly integer?: boolean | undefined;
}

export function quantity(options: QuantityOptions = {}): FieldRule {
  const min = options.min ?? 1;
  const max = options.max ?? 999;
  return (value) => {
    if (isEmpty(value)) return PASS;
    const n = typeof value === 'number' ? value : Number(clean(String(value)).replace(/\s/g, ''));
    if (!Number.isFinite(n)) return fail('validation.number.format', { value: String(value) });
    if (options.integer !== false && !Number.isInteger(n)) {
      return fail('validation.number.integer', { value: String(value) });
    }
    if (n < min || n > max) return fail('validation.quantity.range', { min, max, actual: n });
    return PASS;
  };
}

// ── the registry the schema refers to by name ──────────────────────────────────────────────────

export interface RuleFactoryCatalog {
  readonly required: (o?: RequiredOptions) => FieldRule;
  readonly email: () => FieldRule;
  readonly zaPhone: () => FieldRule;
  readonly password: (o?: PasswordOptions) => FieldRule;
  readonly priceRange: (o?: PriceRangeOptions) => FieldRule;
  readonly postcode: () => FieldRule;
  readonly optionalText: (o?: OptionalTextOptions) => FieldRule;
  readonly oneOf: (allowed: readonly (string | number)[]) => FieldRule;
  readonly matches: (field: string, o?: { caseInsensitive?: boolean }) => FieldRule;
  readonly quantity: (o?: QuantityOptions) => FieldRule;
}

/**
 * `oneOf` takes its allow-list positionally, which is the one shape difference between a factory
 * and the rest; the schema compiles `options: ['a','b']` into this call.
 */
export const ruleCatalog: RuleFactoryCatalog = {
  required,
  email,
  zaPhone,
  password,
  priceRange,
  postcode,
  optionalText,
  oneOf,
  matches,
  quantity,
};

/** Rule names a schema may reference without registering a custom function. */
export const builtinRuleNames = Object.keys(ruleCatalog) as readonly (keyof RuleCatalogOf)[];

export type RuleCatalogOf = typeof ruleCatalog;

/**
 * Standalone helper for callers that want the security report without running a rule (e.g. an
 * admin panel flagging a listing). Returns the issues a human should look at.
 */
export function securityIssues(
  value: string,
  opts?: { multiline?: boolean | undefined; wholeString?: boolean | undefined },
): RuleResult[] {
  const report = sanitise(value, { multiline: opts?.multiline, wholeStringConfusables: opts?.wholeString });
  const confusables = scanConfusables(report.value, { leadingOnly: opts?.wholeString !== true });
  return report.issues.map((issue) =>
    issue.code === 'security.homoglyph_prefix'
      ? fail(issue.code, { ...issue.params, count: confusables.length })
      : fail(issue.code, issue.params, { level: issue.level }),
  );
}
