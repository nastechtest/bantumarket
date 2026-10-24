import './dom-setup.js';
import { describe, expect, test } from 'bun:test';

import { clean, describeInvisibles, parseDigits, parseZaNsn, parseZarAmount, sanitise } from '../deploit.js';

/**
 * Every character under test is built from its numeric codepoint. A source file that *contained* a
 * literal U+202E would read the same as one that does not — the exact property this module defends
 * against — so the fixture can only be honest by naming the codepoints numerically. At runtime these
 * are the real characters, which is what the assertions need.
 */
const cp = (code: number): string => String.fromCodePoint(code);

const RLO = cp(0x202e); // right-to-left override
const LRO = cp(0x202d); // left-to-right override
const ZWSP = cp(0x200b); // zero-width space
const ZWNJ = cp(0x200c); // zero-width non-joiner
const ZWJ = cp(0x200d); // zero-width joiner
const WJ = cp(0x2060); // word joiner
const BOM = cp(0xfeff); // zero-width no-break space
const SHY = cp(0x00ad); // soft hyphen
const NBSP = cp(0x00a0); // no-break space
const LRM = cp(0x200e); // left-to-right mark
const RLM = cp(0x200f); // right-to-left mark
const LRI = cp(0x2066); // left-to-right isolate
const PDI = cp(0x2069); // pop directional isolate
const BELL = cp(0x0007);
const NUL = cp(0x0000);
const ESC = cp(0x001b);
const FULLWIDTH_FIVE = cp(0xff15);
const CYR_E = cp(0x0435); // Cyrillic small ie, looks like "e"
const CYR_SHA = cp(0x0448); // Cyrillic sha, looks like "Ш", not an ASCII confusable
const GREEK_RHO = cp(0x03a1); // Greek Ρ, looks like "P"

describe('deploit.sanitise — what is REMOVED', () => {
  test('a bidi override inside a listing title is removed and flagged', () => {
    const raw = RLO + '100 watch' + RLO;
    const out = sanitise(raw);
    expect(out.value).toBe('100 watch');
    expect(out.removed.map((r) => r.codepoint)).toEqual(['U+202E', 'U+202E']);
    expect(out.hadBidiOverride).toBe(true);
    const flag = out.issues.find((i) => i.code === 'security.bidi_override');
    expect(flag).toBeDefined();
    expect(flag?.params?.leading).toBe(true);
  });

  test('a zero-width inside an email is removed, leaving the address the filter should have seen', () => {
    const raw = 'pay' + ZWSP + 'pal@gmail.com';
    const out = sanitise(raw);
    expect(out.value).toBe('paypal@gmail.com');
    expect(out.removed).toHaveLength(1);
    expect(out.removed[0]?.codepoint).toBe('U+200B');
    expect(out.issues.map((i) => i.code)).toContain('security.zero_width');
  });

  test('the whole zero-width blocklist is stripped: ZWJ, ZWNJ, WJ, BOM, soft hyphen', () => {
    const raw = 'w' + ZWNJ + 'a' + ZWJ + 't' + WJ + BOM + SHY + 'ch';
    const out = sanitise(raw);
    expect(out.value).toBe('watch');
    expect(out.removed.map((r) => r.codepoint)).toEqual(['U+200C', 'U+200D', 'U+2060', 'U+FEFF', 'U+00AD']);
  });

  test('control characters are stripped, and a NUL mid-string does not truncate the value', () => {
    const raw = 'Ro' + NUL + 'lex ' + BELL + 'watch ' + ESC;
    const out = sanitise(raw);
    // Control characters are deleted, not replaced by a space: `Ro\u00000000lex` is `Rolex`.
    expect(out.value).toBe('Rolex watch');
    expect(out.removed.map((r) => r.kind)).toEqual(['control', 'control', 'control']);
    expect(out.issues.map((i) => i.code)).toContain('security.control_chars');
  });

  test('a multiline description keeps newlines but still loses zero-widths and controls', () => {
    const raw = 'Good condition.' + ZWSP + '\nSmall scratch on clasp' + BELL;
    const out = sanitise(raw, { multiline: true });
    expect(out.value).toBe('Good condition.\nSmall scratch on clasp');
    expect(out.removed.map((r) => r.codepoint)).toEqual(['U+200B', 'U+0007']);
  });

  test('NBSP becomes a real space so word boundaries survive (a glued pair is a new token)', () => {
    const raw = 'R100' + NBSP + 'watch';
    expect(sanitise(raw).value).toBe('R100 watch');
    // Without the space substitution this would be "R100watch", which is a different search term.
    expect(clean(raw).includes('watch')).toBe(true);
    expect(clean('1' + NBSP + '200')).toBe('1 200');
  });

  test('directional marks LRM/RLM are removed with the bidi class', () => {
    const out = sanitise(LRM + 'Rolex' + RLM);
    expect(out.value).toBe('Rolex');
    expect(out.removed.map((r) => r.kind)).toEqual(['bidi', 'bidi']);
  });

  test('bidi isolates (LRI/PDI), the modern form of the trick, are removed', () => {
    const out = sanitise(LRI + 'R100 watch' + PDI);
    expect(out.value).toBe('R100 watch');
    expect(out.hadBidiOverride).toBe(true);
    expect(out.issues.some((i) => i.code === 'security.bidi_override')).toBe(true);
  });

  test('whitespace runs collapse and both ends trim', () => {
    expect(sanitise('   Seiko   ' + ZWSP + '   Premier  ').value).toBe('Seiko Premier');
  });

  test('fullwidth digits fold to ASCII — a price field cannot mean anything else', () => {
    expect(clean(FULLWIDTH_FIVE + '99')).toBe('599');
  });
});

describe('deploit.sanitise — what is FLAGGED but NOT removed', () => {
  test('a leading homoglyph stays in the value and comes back with its codepoint and its lookalike', () => {
    // `Rоlех` built with Cyrillic о and х: visually a Rolex, textually not one.
    const raw = 'R' + cp(0x043e) + 'lex';
    const out = sanitise(raw);
    expect(out.value).toBe(raw);
    expect(out.flagged).toHaveLength(1);
    expect(out.flagged[0]?.codepoint).toBe('U+043E');
    expect(out.flagged[0]?.looksLike).toBe('o');
    expect(out.issues.some((i) => i.code === 'security.homoglyph_prefix')).toBe(true);
  });

  test('a Cyrillic first character is flagged as a prefix, which is what breaks search previews', () => {
    const raw = GREEK_RHO + 'lex watch';
    const out = sanitise(raw);
    expect(out.value).toBe(raw);
    expect(out.flagged.map((f) => f.looksLike)).toEqual(['P']);
  });

  test('mid-string confusables are ignored in leading-only mode (a surname is not an attack)', () => {
    const out = sanitise('Bogota ' + CYR_E + 'nvelope');
    expect(out.flagged).toHaveLength(0);
    const whole = sanitise('Bogota ' + CYR_E + 'nvelope', { wholeStringConfusables: true });
    expect(whole.flagged.map((f) => f.codepoint)).toEqual(['U+0435']);
  });

  test('a non-confusable non-ASCII character is neither removed nor flagged', () => {
    const out = sanitise('isikhathi ' + CYR_SHA);
    expect(out.flagged).toHaveLength(0);
    expect(out.value).toBe('isikhathi ' + CYR_SHA);
  });

  test('a clean value produces no issues at all', () => {
    const out = sanitise('Seiko 5 automatic, R4 500');
    expect(out.issues).toHaveLength(0);
    expect(out.removed).toHaveLength(0);
    expect(out.flagged).toHaveLength(0);
  });

  test('describeInvisibles names codepoints without ever returning the characters themselves', () => {
    const report = describeInvisibles('a' + ZWSP + RLO + 'b');
    expect(report).toBe('U+200B U+202E');
    expect(report.includes(ZWSP)).toBe(false);
    expect(describeInvisibles('clean')).toBe('none');
  });
});

describe('deploit — the attacks that actually appear in listings', () => {
  test('the two-listings-that-look-identical case produces one value, not two', () => {
    const honest = 'R100 watch';
    const trick = RLO + honest + RLO;
    expect(trick).not.toBe(honest);
    expect(sanitise(trick).value).toBe(honest);
  });

  test('a zero-width-padded title is measured by its visible length', () => {
    const padded = 'Rolex ' + ZWSP.repeat(40);
    expect(padded.length).toBe(46);
    expect(clean(padded)).toBe('Rolex');
    expect(clean(padded).length).toBe(5);
  });

  test('the scam email `gm<U+200B>ail.com` is reported as an invisible edit, not as a syntax error', () => {
    const raw = 'seller' + ZWSP + '@gmail.co.za';
    const out = sanitise(raw, { wholeStringConfusables: true });
    expect(out.issues.map((i) => i.code)).toEqual(['security.zero_width']);
    expect(out.value).toBe('seller@gmail.co.za');
  });
});

describe('parseZarAmount', () => {
  test('accepts the separators a South African seller actually types', () => {
    expect(parseZarAmount('R1 200.50')).toEqual({ ok: true, cents: 120050 });
    expect(parseZarAmount('1 200,50')).toEqual({ ok: true, cents: 120050 });
    expect(parseZarAmount('1.200,50')).toEqual({ ok: true, cents: 120050 });
    expect(parseZarAmount('1' + NBSP + '200')).toEqual({ ok: true, cents: 120000 });
    expect(parseZarAmount(FULLWIDTH_FIVE + '00')).toEqual({ ok: true, cents: 50000 });
  });

  test('`1.200` is R1 200, not R1.20 — the SA grouping convention', () => {
    expect(parseZarAmount('1.200').cents).toBe(120000);
    expect(parseZarAmount('1.200.000').cents).toBe(120000000);
    expect(parseZarAmount('1.20').cents).toBe(120);
  });

  test('rejects sub-cent precision rather than silently rounding the ledger', () => {
    // `100.999` has the same shape as `1.200`, so it reads as R100 999; the caller must echo that
    // reading back to the seller rather than assume it.
    expect(parseZarAmount('R100.999')).toEqual({ ok: true, cents: 10099900, ambiguous: true });
    expect(parseZarAmount('R100.9999')).toEqual({ ok: false, reason: 'too_precise' });
  });

  test('rejects negatives and non-numbers with a reason, never an exception', () => {
    expect(parseZarAmount('-50')).toEqual({ ok: false, reason: 'negative' });
    expect(parseZarAmount('free!')).toEqual({ ok: false, reason: 'not_a_number' });
    expect(parseZarAmount('')).toEqual({ ok: false, reason: 'empty' });
  });

  test('an invisible character cannot smuggle a different number than the one displayed', () => {
    // Displays as "R1 200"; logically "1" then a control then "200".
    const sneaky = 'R1' + BELL + '200';
    expect(parseZarAmount(sneaky)).toEqual({ ok: true, cents: 120000 });
  });
});

describe('parseDigits and parseZaNsn', () => {
  test('parseDigits strips everything that is not a digit after cleaning', () => {
    expect(parseDigits('072' + NBSP + '555' + ZWSP + '1234')).toBe('0725551234');
    expect(parseDigits('no digits here')).toBeUndefined();
  });

  test('parseZaNsn normalises +27 to the local 0 form', () => {
    expect(parseZaNsn('+27 82 555 1234')).toBe('0825551234');
    expect(parseZaNsn('082 555 1234')).toBe('0825551234');
    expect(parseZaNsn('27825551234')).toBe('27825551234');
  });
});
