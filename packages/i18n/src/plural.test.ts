/**
 * CLDR plural categories. The point of these tests is that the four languages DISAGREE on the same
 * numbers, which a naive "one vs many" check would get wrong. Each difference traces to a distinct
 * CLDR operand rule (en: `i=1 and v=0`; af/xh: `n=1`; zu: `i=0 or n=1`).
 */

import { describe, it, expect } from 'bun:test';
import { Plural, pluralOperands, pluralCategory } from './plural.js';

describe('pluralOperands — the CLDR operands are computed from the displayed form', () => {
  it('integer 1 has no visible fraction digits', () => {
    expect(pluralOperands(1)).toMatchObject({ n: 1, i: 1, v: 0, f: 0 });
  });
  it('the string "1.0" keeps v=1 and f=0 (the distinction English keys on)', () => {
    expect(pluralOperands('1.0')).toMatchObject({ n: 1, i: 1, v: 1, f: 0 });
  });
  it('"0.50" gives f=50 and t=5 (trailing zero dropped only for w/t)', () => {
    expect(pluralOperands('0.50')).toMatchObject({ i: 0, v: 2, f: 50, t: 5 });
  });
  it('negatives use the magnitude', () => {
    expect(pluralOperands(-2)).toMatchObject({ n: 2, i: 2 });
  });
});

describe('Plural.select — categories differ per language on the same value', () => {
  it('English: one only for integer 1', () => {
    expect(Plural.select('en', 1)).toBe('one');
    expect(Plural.select('en', '1.0')).toBe('other'); // v != 0
    expect(Plural.select('en', 0)).toBe('other');
    expect(Plural.select('en', 2)).toBe('other');
  });

  it('Afrikaans / isiXhosa: one for n = 1, including the displayed "1.0"', () => {
    expect(Plural.select('af', 1)).toBe('one');
    expect(Plural.select('af', '1.0')).toBe('one'); // differs from English
    expect(Plural.select('xh', '1.0')).toBe('one');
    expect(Plural.select('af', 0)).toBe('other');
    expect(Plural.select('af', 2)).toBe('other');
  });

  it('isiZulu: one when i = 0 or n = 1 — so 0 and sub-1 fractions are "one", unlike English', () => {
    expect(Plural.select('zu', 0)).toBe('one');
    expect(Plural.select('zu', '0.5')).toBe('one'); // i = 0
    expect(Plural.select('zu', 1)).toBe('one');
    expect(Plural.select('zu', 1.5)).toBe('other'); // i = 1, n != 1
    expect(Plural.select('zu', 2)).toBe('other');
  });

  it('an unlisted value always resolves to the mandated "other" default', () => {
    expect(Plural.select('en', 1_000_000)).toBe('other');
    expect(Plural.select('zu', 1_000_000)).toBe('other');
  });
});

describe('Plural.categoriesFor — reports the forms an author must supply', () => {
  it('all four launch languages need only {one, other} for cardinals', () => {
    expect(Plural.categoriesFor('en')).toEqual(['one', 'other']);
    expect(Plural.categoriesFor('af')).toEqual(['one', 'other']);
    expect(Plural.categoriesFor('zu')).toEqual(['one', 'other']);
    expect(Plural.categoriesFor('xh')).toEqual(['one', 'other']);
  });
});

describe('pluralCategory — function form agrees with Plural.select', () => {
  it('dispatches identically', () => {
    expect(pluralCategory('en', 1)).toBe(Plural.select('en', 1));
    expect(pluralCategory('zu', 0)).toBe(Plural.select('zu', 0));
  });
});
