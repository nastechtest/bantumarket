/**
 * Low-level Unicode scanning for `deploit.ts` and the text rules.
 *
 * Everything here is *detection and description*. The policy — what gets removed, what gets kept
 * and flagged — lives in `deploit.ts`, so a reviewer can read one function and see the decision
 * rather than hunting it through regexes.
 *
 * Codepoints are written as escapes on purpose. A source file containing a literal U+202E is
 * unreadable to the next person and survives most code review.
 */

export type InvisibleClass =
  /** U+200B/200C/200D/2060/FEFF/00AD — occupy no advance width; the classic "two identical titles". */
  | 'zero_width'
  /** U+202A-202E, U+2066-2069, U+200E/200F — reorder how the string renders. */
  | 'bidi'
  /** U+00A0 and friends — a space that does not collapse and does not match `^\s`. */
  | 'nbsp'
  /** C0/C1 controls other than the ones a textarea legitimately contains. */
  | 'control';

const ZERO_WIDTH: ReadonlyMap<string, InvisibleClass> = new Map([
  ['200b', 'zero_width'],
  ['200c', 'zero_width'],
  ['200d', 'zero_width'],
  ['2060', 'zero_width'],
  ['feff', 'zero_width'],
  ['00ad', 'zero_width'],
  ['180e', 'zero_width'],
]);

const BIDI: ReadonlyMap<string, InvisibleClass> = new Map([
  ['202a', 'bidi'],
  ['202b', 'bidi'],
  ['202c', 'bidi'],
  ['202d', 'bidi'],
  ['202e', 'bidi'],
  ['2066', 'bidi'],
  ['2067', 'bidi'],
  ['2068', 'bidi'],
  ['2069', 'bidi'],
  ['200e', 'bidi'],
  ['200f', 'bidi'],
]);

const NBSP: ReadonlyMap<string, InvisibleClass> = new Map([
  ['00a0', 'nbsp'],
  ['1680', 'nbsp'],
  ['2000', 'nbsp'],
  ['2001', 'nbsp'],
  ['2002', 'nbsp'],
  ['2003', 'nbsp'],
  ['2004', 'nbsp'],
  ['2005', 'nbsp'],
  ['2006', 'nbsp'],
  ['2007', 'nbsp'],
  ['2008', 'nbsp'],
  ['2009', 'nbsp'],
  ['200a', 'nbsp'],
  ['202f', 'nbsp'],
  ['205f', 'nbsp'],
  ['3000', 'nbsp'],
]);

/** Characters removed outright. `‭‬` and `‭‮` stay: they are legitimate RTL marks. */
const LEGITIMATE_CONTROLS = new Set(['\t', '\n', '\r']);

const CLASS_BY_CODEPOINT: ReadonlyMap<string, InvisibleClass> = new Map<string, InvisibleClass>([
  ...ZERO_WIDTH,
  ...BIDI,
  ...NBSP,
]);

export interface InvisibleHit {
  readonly index: number;
  readonly ch: string;
  readonly codepoint: string;
  readonly kind: InvisibleClass;
}

export interface InvisibleScan {
  readonly hits: readonly InvisibleHit[];
  readonly kinds: ReadonlySet<InvisibleClass>;
}

function classOf(ch: string): InvisibleClass | undefined {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return undefined;
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) {
    return LEGITIMATE_CONTROLS.has(ch) ? undefined : 'control';
  }
  return CLASS_BY_CODEPOINT.get(cp.toString(16).padStart(4, '0'));
}

export function formatCodepoint(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Every invisible/control character in `text`, with its position. Never mutates. */
export function scanInvisible(text: string): InvisibleScan {
  const hits: InvisibleHit[] = [];
  const kinds = new Set<InvisibleClass>();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const kind = classOf(ch);
    if (kind) {
      hits.push({ index: i, ch, codepoint: formatCodepoint(ch), kind });
      kinds.add(kind);
    }
  }
  return { hits, kinds };
}

/**
 * Characters outside `[a-zA-Z0-9 .,'!?-]` that visually stand for a character inside it. This is
 * not a full confusables table; it covers the lookalikes that actually appear in marketplace
 * listings — Cyrillic and Greek swaps, plus fullwidth Latin from phone keyboards.
 */
const HOMOGLYPHS: ReadonlyMap<string, string> = new Map<string, string>([
  ['\u0430', 'a'], // Cyrillic а
  ['\u0435', 'e'], // Cyrillic е
  ['\u043e', 'o'], // Cyrillic о
  ['\u0440', 'p'], // Cyrillic р
  ['\u0441', 'c'], // Cyrillic с
  ['\u0443', 'y'], // Cyrillic у
  ['\u0445', 'x'], // Cyrillic х
  ['\u0422', 'T'], // Cyrillic Т
  ['\u0412', 'B'], // Cyrillic В
  ['\u041d', 'H'], // Cyrillic Н
  ['\u041c', 'M'], // Cyrillic М
  ['\u0456', 'i'], // Cyrillic і
  ['\u04bb', 'j'], // Cyrillic ј
  ['\u0476', 'q'], // Cyrillic Q (obsolete, seen in scraped spam)
  ['\u0391', 'A'], // Greek Α
  ['\u0392', 'B'], // Greek Β
  ['\u0395', 'E'], // Greek Ε
  ['\u0396', 'Z'], // Greek Ζ
  ['\u0397', 'H'], // Greek Η
  ['\u0399', 'I'], // Greek Ι
  ['\u03a1', 'P'], // Greek Ρ
  ['\u03a4', 'T'], // Greek Τ
  ['\u03a5', 'Y'], // Greek Υ
  ['\u03a7', 'X'], // Greek Χ
  ['\u03bf', 'o'], // Greek ο
  ['\u03b5', 'e'], // Greek ε (lunate-ish, common in fake brand names)
]);

const FULLWIDTH_DIGITS = '\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19';
const ASCII_DIGITS = '0123456789';

/** U+FF10-U+FF19 → "0"-"9"; U+FF21… fullwidth letters → ASCII. Returns undefined if nothing to fold. */
export function foldFullwidth(text: string): string | undefined {
  let out = '';
  let changed = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xff10 && cp <= 0xff19) {
      out += String.fromCharCode(0x30 + (cp - 0xff10));
      changed = true;
    } else if (cp >= 0xff21 && cp <= 0xff3a) {
      out += String.fromCharCode(0x41 + (cp - 0xff21));
      changed = true;
    } else if (cp >= 0xff41 && cp <= 0xff5a) {
      out += String.fromCharCode(0x61 + (cp - 0xff41));
      changed = true;
    } else {
      out += ch;
    }
  }
  return changed ? out : undefined;
}

export function isFullwidthDigit(ch: string): boolean {
  return FULLWIDTH_DIGITS.includes(ch);
}

export function fullwidthToAsciiDigit(ch: string): string | undefined {
  const i = FULLWIDTH_DIGITS.indexOf(ch);
  return i >= 0 ? ASCII_DIGITS[i] : undefined;
}

export interface ConfusableHit {
  readonly index: number;
  readonly ch: string;
  readonly codepoint: string;
  readonly looksLike: string;
}

/**
 * Homoglyph detection.
 *
 * `leadingOnly` restricts to the **first whitespace-delimited token**, which is where the scam has to
 * sit to work: `Rоlex` (Cyrillic о) in a search-result preview reads as Rolex to the buyer and sorts
 * as something else to the filter. Mid-string Cyrillic is far more often a legitimate surname
 * (`Bogotá`, `Nikolaеvа`), so a name/description field uses `leadingOnly` and only email, phone and
 * price are scanned whole-string.
 */
export function scanConfusables(text: string, opts?: { leadingOnly?: boolean | undefined }): ConfusableHit[] {
  const hits: ConfusableHit[] = [];
  const tokenEnd = opts?.leadingOnly === true ? (text.search(/\s/) === -1 ? text.length : text.search(/\s/)) : text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const looksLike = HOMOGLYPHS.get(ch) ?? (isFullwidthDigit(ch) ? fullwidthToAsciiDigit(ch) : undefined);
    if (looksLike === undefined) continue;
    if (i >= tokenEnd) continue;
    hits.push({ index: i, ch, codepoint: formatCodepoint(ch), looksLike });
  }
  return hits;
}

export function hasLeadingBidiOverride(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const cp = ch.codePointAt(0)!;
    if (/\s/.test(ch)) continue;
    return cp === 0x202d || cp === 0x202e || cp === 0x2066 || cp === 0x2067 || cp === 0x2068;
  }
  return false;
}

/** Trim that also eats the whitespace Unicode defines but `\s` in a browser regex may not. */
export function trimEdges(text: string): string {
  return text.replace(/^[\s\u00a0\u2000-\u200b\u205f\u3000\ufeff]+/, '').replace(/[\s\u00a0\u2000-\u200b\u205f\u3000\ufeff]+$/, '');
}

export function collapseRuns(text: string, multiline: boolean): string {
  return multiline ? text.replace(/[ \t\u00a0]+/g, ' ').replace(/\n{3,}/g, '\n\n') : text.replace(/[\s\u00a0]+/g, ' ');
}
