/**
 * The colour engine, tested against WCAG's own arithmetic rather than against this implementation.
 *
 * Every expected ratio below was computed from the published formula (linearise each channel, weight
 * 0.2126/0.7152/0.0722, then (L1+0.05)/(L2+0.05)) before it was typed into this file, so a regression
 * in `color.ts` shows up as a wrong number rather than as a matching wrong number.
 */

import { describe, expect, it } from 'bun:test';
import { raw } from '@nastech/design-tokens';
import { contrastRatio, hexOf, parseColor, relativeLuminance, tokenName, type Rgb } from '../color.js';

const color = (input: string): Rgb => {
  const parsed = parseColor(input);
  if (parsed === null) throw new Error(`fixture colour failed to parse: ${input}`);
  return parsed;
};

describe('parseColor', () => {
  it('reads 6- and 3-digit hex, case-insensitively, and expands the shorthand', () => {
    expect(color('#7B858F')).toEqual({ r: 123, g: 133, b: 143, a: 1 });
    expect(color('#7b858f')).toEqual(color('#7B858F'));
    expect(color('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('reads the handful of CSS names a hand-written style attribute actually uses', () => {
    expect(color('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(color('BLACK')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(color('transparent').a).toBe(0);
  });

  it('reads rgb() and rgba(), with commas, slashes, and percentages', () => {
    expect(color('rgb(12, 34, 56)')).toEqual({ r: 12, g: 34, b: 56, a: 1 });
    expect(color('rgba(12, 34, 56, 0.25)').a).toBeCloseTo(0.25, 5);
    expect(color('rgb(0 128 255 / 50%)').a).toBeCloseTo(0.5, 5);
    expect(color('rgb(50%, 0%, 100%)')).toEqual({ r: 127.5, g: 0, b: 255, a: 1 });
  });

  it('returns null for anything it cannot resolve instead of inventing a colour', () => {
    for (const junk of ['', '   ', null, undefined, 'inherit', 'currentColor', 'rebeccapurple', '#12345', 'rgb(1,2)', '#zzzzzz', 'hsl(0,50%,50%)']) {
      expect(parseColor(junk as string | null | undefined)).toBeNull();
    }
  });
});

describe('relativeLuminance', () => {
  it('is anchored at the two ends of the scale', () => {
    expect(relativeLuminance(color('#000000'))).toBe(0);
    expect(relativeLuminance(color('#FFFFFF'))).toBe(1);
  });

  it('uses the linear path below the knee and the power path above it', () => {
    // 10/255 = 0.03922 ≤ 0.03928, so this channel must be divided by 12.92, not exponentiated.
    expect(relativeLuminance(color('#0A0A0A'))).toBeCloseTo(10 / 255 / 12.92, 8);
    expect(relativeLuminance(color('#808080'))).toBeCloseTo(((128 / 255 + 0.055) / 1.055) ** 2.4, 8);
  });

  it('weights the channels the way the spec does — green dominates', () => {
    expect(relativeLuminance(color('#00FF00'))).toBeGreaterThan(relativeLuminance(color('#FF0000')));
    expect(relativeLuminance(color('#0000FF'))).toBeLessThan(relativeLuminance(color('#FF0000')));
  });
});

describe('contrastRatio', () => {
  it('returns exactly 21 for the maximum pair and 1 for an identical pair', () => {
    expect(contrastRatio(color('#000000'), color('#FFFFFF'))).toBeCloseTo(21, 6);
    expect(contrastRatio(color('#7B858F'), color('#7B858F'))).toBeCloseTo(1, 6);
  });

  it('is symmetric: which colour is text and which is background cannot change the answer', () => {
    const fg = color('#767676');
    const bg = color('#FFFFFF');
    expect(contrastRatio(fg, bg)).toBeCloseTo(contrastRatio(bg, fg), 10);
  });

  it('reproduces the two greys the web quotes at each side of the 4.5 line', () => {
    // The canonical pair: one hex digit moves the answer across the normal-text threshold.
    expect(contrastRatio(color('#767676'), color('#FFFFFF'))).toBeCloseTo(4.5422, 3);
    expect(contrastRatio(color('#777777'), color('#FFFFFF'))).toBeCloseTo(4.4781, 3);
    expect(contrastRatio(color('#949494'), color('#FFFFFF'))).toBeCloseTo(3.0335, 3);
  });

  it('composites a translucent foreground over the background before measuring it', () => {
    // Half-black on white is #7F7F7F: 3.98:1. Treating the alpha as 1 would read it as 21:1 and pass
    // text that a buyer with a washed-out screen cannot read at all.
    expect(contrastRatio(color('rgba(0,0,0,0.5)'), color('#FFFFFF'))).toBeCloseTo(3.9767, 3);
    expect(contrastRatio(color('rgba(0,0,0,0)'), color('#FFFFFF'))).toBeCloseTo(1, 6);
  });
});

describe('tokenName and hexOf', () => {
  it('names a palette colour so a report says which token to change', () => {
    expect(tokenName(color(raw.color.paper))).toBe('raw.color.paper');
    expect(tokenName(color(raw.color.ink300))).toBe('raw.color.ink300');
    expect(tokenName(color(raw.color.signalNegative))).toBe('raw.color.signalNegative');
  });

  it('stays silent on a colour that is not in the palette, and hexOf prints it', () => {
    expect(tokenName(color('#777777'))).toBeNull();
    expect(hexOf(color('#777777'))).toBe('#777777');
    // 50% is 127.5, and `hexOf` rounds: the printed hex is the colour a browser would paint, not the
    // float the parser carried.
    expect(hexOf(color('rgb(50%, 0%, 100%)'))).toBe('#8000FF');
  });

  it('will not call a translucent colour a token, because the token is not what renders', () => {
    expect(tokenName(color('rgba(255,255,255,0.5)'))).toBeNull();
  });
});

/**
 * The palette itself, measured. This is the part the design system cannot cheat: a token pair that
 * fails here fails in a buyer's browser, and the only two answers are "change the token" or "record
 * why the exemption applies".
 */
describe('the shipped palette against its own paper', () => {
  const paper = color(raw.color.paper);
  const ratio = (token: string): number => contrastRatio(color(token), paper);

  it('carries body text well past the threshold', () => {
    expect(ratio(raw.color.ink900)).toBeGreaterThan(15);
    expect(ratio(raw.color.ink700)).toBeGreaterThan(12);
    expect(ratio(raw.color.ink500)).toBeGreaterThan(9);
  });

  it('keeps every signal and accent colour usable as normal text', () => {
    for (const token of [raw.color.accent600, raw.color.signalPositive, raw.color.signalCaution, raw.color.signalNegative]) {
      expect(ratio(token)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('records ink300 as large-text-only, which is what the disabled-text exemption costs', () => {
    // 3.75:1 passes 3:1 and fails 4.5:1. WCAG 1.4.3 exempts inactive UI text, and `tokens.text.disabled`
    // uses this colour — so the exemption is the only thing that keeps it legal, and it must never be
    // reused for body copy on the assumption that it is "just a grey".
    expect(ratio(raw.color.ink300)).toBeCloseTo(3.7541, 3);
    expect(ratio(raw.color.ink300)).toBeGreaterThanOrEqual(3);
    expect(ratio(raw.color.ink300)).toBeLessThan(4.5);
  });

  it('keeps ink100 and paperWarm as surfaces and borders, not text', () => {
    // Both are near-invisible against paper. Correct for a hairline rule; a bug the moment anything
    // starts setting text in them, which is why they are asserted rather than merely present.
    expect(ratio(raw.color.ink100)).toBeLessThan(3);
    expect(ratio(raw.color.paperWarm)).toBeLessThan(1.2);
  });
});
