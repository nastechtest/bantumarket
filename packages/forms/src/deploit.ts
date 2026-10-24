/**
 * Input sanitisation as security work, not tidiness.
 *
 * The mechanic a marketplace has to defend: a listing title typed as
 * `"R&#8207;100 watch"` renders to a human as `R100 watch`, but its *logical* order and its
 * byte-level identity are something else — so a filter looking for the literal `R100` misses it, a
 * sort puts it in the wrong place, and two listings that look identical in the grid are different
 * rows to the abuse tooling. Same story for a zero-width inside an email (`paypal@gm​ail.com`) and
 * for a Cyrillic `с` in `сitizen bank`.
 *
 * Policy, and the reason for each half:
 *
 *  REMOVED (never survives into the value):
 *   - control characters except the `\t \n \r` a textarea legitimately contains
 *   - zero-width characters (U+200B/200C/200D/2060/FEFF, U+00AD soft hyphen, U+180E)
 *   - bidi embedding/override/isolate/format characters (U+202A-202E, U+2066-2069, U+200E/200F)
 *   - NBSP and Unicode space variants, folded to a normal space
 *   - leading/trailing whitespace; runs of inner whitespace collapsed
 *   - fullwidth digits and fullwidth Latin letters, folded to ASCII (a price field cannot mean
 *     `５００` as anything other than `500`)
 *  Removal is *not* silent: every removal appears in `SanitisedInput.removed`, and a bidi or
 *  zero-width removal additionally raises a `security.*` flag. We do not trust a strip that no one
 *  can audit.
 *
 *  FLAGGED, NOT REMOVED:
 *   - homoglyph lookalikes in the leading run of the value (Cyrillic/Greek swaps). Replacing them
 *     would change what the seller wrote — `Bogotá` and a Cyrillic `б` are different decisions to
 *     make for a human, not for a form. They surface as `security.homoglyph_prefix` with the
 *     codepoint and the ASCII it imitates, so review can decide.
 *   - text that contained a bidi override *anywhere*: stripped for the user's sake, flagged for the
 *     moderator's.
 */

import type { FormIssue } from './types.js';
import type { InvisibleClass } from './text.js';
import {
  collapseRuns,
  foldFullwidth,
  hasLeadingBidiOverride,
  scanConfusables,
  scanInvisible,
  trimEdges,
} from './text.js';

export interface SanitiseOptions {
  /** Keep `\n` and `\t` — for a description textarea. Default false (single-line semantics). */
  readonly multiline?: boolean | undefined;
  /** Full-string homoglyph scan instead of leading-run only. Use for email/phone/price. */
  readonly wholeStringConfusables?: boolean | undefined;
}

export interface RemovedChar {
  readonly codepoint: string;
  readonly kind: 'zero_width' | 'bidi' | 'nbsp' | 'control';
  readonly index: number;
}

export interface FlaggedChar {
  readonly codepoint: string;
  readonly looksLike: string;
  readonly index: number;
}

export interface SanitisedInput {
  readonly value: string;
  readonly removed: readonly RemovedChar[];
  readonly flagged: readonly FlaggedChar[];
  /** True when a bidi override or isolate was present. The *rendered* order differed from logical. */
  readonly hadBidiOverride: boolean;
  readonly issues: readonly FormIssue[];
}

const BIDI_REMOVED_NOTE = 'bidi control characters were removed; the text you see is not what was typed';

export function sanitise(raw: string, opts: SanitiseOptions = {}): SanitisedInput {
  const removed: RemovedChar[] = [];
  const flagged: FlaggedChar[] = [];
  const issues: FormIssue[] = [];
  const multiline = opts.multiline === true;

  let text = raw;

  const scan = scanInvisible(text);
  const hits = scan.hits.filter(
    (hit) => !(multiline && (hit.ch === '\n' || hit.ch === '\t' || hit.ch === '\r')),
  );
  if (hits.length > 0) {
    // Splice in one pass so `removed` indices still refer to the caller's original string.
    let out = '';
    let cursor = 0;
    for (const hit of hits) {
      removed.push({ codepoint: hit.codepoint, kind: hit.kind, index: hit.index });
      out += text.slice(cursor, hit.index);
      // A folded space must not glue two words into one.
      out += hit.kind === 'nbsp' ? ' ' : '';
      cursor = hit.index + 1;
    }
    out += text.slice(cursor);
    text = out;
  }

  const kinds = new Set<InvisibleClass>(removed.map((r) => r.kind));

  const fullwidthFolded = foldFullwidth(text);
  if (fullwidthFolded !== undefined) {
    text = fullwidthFolded;
    // Not a `removed` entry: the character was translated, not deleted, and the meaning is unchanged.
  }

  text = trimEdges(text);
  text = collapseRuns(text, multiline);

  const hadBidiOverride = hasLeadingBidiOverride(raw) || scan.hits.some((h) => h.kind === 'bidi');

  if (kinds.has('zero_width')) {
    issues.push({
      code: 'security.zero_width',
      params: { codepoints: removed.filter((r) => r.kind === 'zero_width').map((r) => r.codepoint) },
    });
  }
  if (kinds.has('bidi')) {
    issues.push({
      code: 'security.bidi_override',
      params: {
        codepoints: removed.filter((r) => r.kind === 'bidi').map((r) => r.codepoint),
        leading: hasLeadingBidiOverride(raw),
        note: BIDI_REMOVED_NOTE,
      },
    });
  }
  if (kinds.has('nbsp')) {
    issues.push({
      code: 'security.nbsp',
      params: { codepoints: removed.filter((r) => r.kind === 'nbsp').map((r) => r.codepoint) },
      level: 'info',
    });
  }
  if (kinds.has('control')) {
    issues.push({
      code: 'security.control_chars',
      params: { codepoints: removed.filter((r) => r.kind === 'control').map((r) => r.codepoint) },
    });
  }

  const confusables = scanConfusables(text, {
    leadingOnly: opts.wholeStringConfusables !== true,
  });
  for (const hit of confusables) {
    flagged.push({ codepoint: hit.codepoint, looksLike: hit.looksLike, index: hit.index });
  }
  if (confusables.length > 0) {
    issues.push({
      code: 'security.homoglyph_prefix',
      params: {
        samples: confusables.slice(0, 4).map((h) => `${h.codepoint}(${h.looksLike})`),
        wholeString: opts.wholeStringConfusables === true,
      },
    });
  }

  return { value: text, removed, flagged, hadBidiOverride, issues };
}

/** The value the app should store/validate — everything else on `SanitisedInput` is for review. */
export function clean(raw: string, opts: SanitiseOptions = {}): string {
  return sanitise(raw, opts).value;
}

/** For an abuse report: the distinct codepoints found, or `'none'`. Never contains the raw chars. */
export function describeInvisibles(text: string): string {
  const found = new Set<string>();
  for (const hit of scanInvisible(text).hits) found.add(hit.codepoint);
  return found.size === 0 ? 'none' : Array.from(found).join(' ');
}

/**
 * Numeric parsers for the fields where a scam hides in formatting rather than in digits:
 * thousands separators (`1 200 000`, `1.200.000`), NBSP separators, and fullwidth digits.
 *
 * Each returns a result object and never throws — a parse failure is a validation error with a
 * code, not an exception that unwinds a submit handler.
 */
export type ParsedMoney =
  | {
      readonly ok: true;
      readonly cents: number;
      /**
       * Present (`true`) only when the input had a single separator followed by exactly three digits,
       * which this parser reads as a thousands group (`R1.200` = R1 200). The 1000x risk goes the
       * other way if we guessed the opposite, so the guess is surfaced and the caller echoes the
       * normalised amount back. Absent on every unambiguous result.
       */
      readonly ambiguous?: true;
      readonly reason?: undefined;
    }
  | { readonly ok: false; readonly cents?: undefined; readonly ambiguous?: undefined; readonly reason: 'empty' | 'not_a_number' | 'negative' | 'too_precise' };

/**
 * `"R1 200.50"`, `"1 200,50"`, `"1.200,50"`, `"\uFF15\uFF10\uFF10"` -> 120050 cents.
 *
 * Separator policy, in one place because a marketplace cannot have two answers to `1.200`:
 *  - no separator                 -> whole rands
 *  - one separator, 1-2 digits after -> decimal cents (`R1.2`, `R1,20`)
 *  - one separator, exactly 3 after  -> thousands group, `ambiguous: true` (`R1.200`, `R1,200`)
 *  - one separator, 4+ after         -> rejected as `too_precise`; the ledger is whole cents and
 *                                        `money()` in api-contracts throws on anything else
 *  - repeated separators             -> every group must be exactly 3 digits or the input is rejected
 *  - both `.` and `,`               -> the later one is the decimal, the others are grouping
 */
export function parseZarAmount(raw: string): ParsedMoney {
  const stripped = clean(raw).replace(/[\s\u00a0]/g, '').replace(/^[Rr]/, '');
  if (stripped === '') return { ok: false, reason: 'empty' };
  if (stripped.startsWith('-')) return { ok: false, reason: 'negative' };
  if (!/^[\d.,]+$/.test(stripped) || !/\d/.test(stripped)) return { ok: false, reason: 'not_a_number' };

  const lastComma = stripped.lastIndexOf(',');
  const lastDot = stripped.lastIndexOf('.');
  const decimalAt =
    lastComma >= 0 && lastDot >= 0
      ? Math.max(lastComma, lastDot)
      : lastComma >= 0
        ? lastComma
        : lastDot;

  if (decimalAt === -1) return { ok: true, cents: Number(stripped) * 100 };

  const intRaw = stripped.slice(0, decimalAt);
  const tail = stripped.slice(decimalAt + 1);
  const separatorCount = (stripped.match(/[.,]/g) ?? []).length;

  if (intRaw === '') return { ok: false, reason: 'not_a_number' };
  // Anything before the last separator is grouping, so every group after the first must be 3 digits:
  // `1.23.456` is a typo, and reading it as `123456` would invent a price the seller never typed.
  const groups = intRaw.split(/[.,]/);
  if (groups.length > 1) {
    if (groups[0]!.length === 0 || groups[0]!.length > 3) return { ok: false, reason: 'not_a_number' };
    if (groups.slice(1).some((g) => g.length !== 3)) return { ok: false, reason: 'not_a_number' };
  }
  const digits = intRaw.replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits) || digits.length > 12) return { ok: false, reason: 'not_a_number' };

  if (tail.length === 3) {
    if (groups.length > 1 && groups.slice(1).some((g) => g.length !== 3)) {
      return { ok: false, reason: 'not_a_number' };
    }
    // Repeated 3-digit groups are unambiguously thousands (`1.200.000`); a single one is the ambiguous
    // case, so `ambiguous` tells the caller to echo the reading back to the seller.
    return {
      ok: true,
      cents: Number(digits + tail) * 100,
      ...(separatorCount === 1 ? { ambiguous: true as const } : {}),
    };
  }
  if (tail.length > 3) return { ok: false, reason: 'too_precise' };
  if (tail.length > 2) {
    // Three digits would have been grouping; one to two is the only valid decimal length.
    return { ok: false, reason: 'not_a_number' };
  }
  const cents = tail === '' ? 0 : Number(tail.padEnd(2, '0'));
  return { ok: true, cents: Number(digits) * 100 + cents };
}

/** Digits only, after the same clean pass. Anything else is `undefined`. */
export function parseDigits(raw: string): string | undefined {
  const cleaned = clean(raw);
  if (cleaned === '') return undefined;
  const digits = cleaned.replace(/\D/g, '');
  return digits === '' ? undefined : digits;
}

/**
 * ZA phone numeric form: keeps a leading `0`, turns a `+27` prefix into `0`, drops separators.
 * Deliberately does not validate — that is `rules.zaPhone`'s job; this only normalises.
 */
export function parseZaNsn(raw: string): string {
  const cleaned = clean(raw);
  const digits = (cleaned.match(/\d/g) ?? []).join('');
  const plusPrefixed = /^\s*\+/.test(cleaned);
  if (plusPrefixed && digits.startsWith('27')) return `0${digits.slice(2)}`;
  return digits;
}
