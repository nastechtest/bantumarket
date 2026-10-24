/**
 * ICU subset: interpolation, select, plural, and `#`. Includes the cross-language plural dispatch
 * (a pattern resolved under isiZulu picks "one" for 0, English does not), which is the whole reason
 * this engine takes a locale.
 */

import { describe, it, expect } from 'bun:test';
import { formatIcu } from './icu.js';

describe('formatIcu — interpolation', () => {
  it('substitutes string args', () => {
    expect(formatIcu('Sawubona, {name}!', { name: 'Thandi' }, { locale: 'zu' })).toBe('Sawubona, Thandi!');
  });
  it('formats numeric args with the locale separators', () => {
    expect(formatIcu('{n}', { n: 1234567 }, { locale: 'en' })).toBe('1,234,567');
    expect(formatIcu('{n}', { n: 1234567 }, { locale: 'af' })).toBe('1 234 567');
  });
  it('renders a missing arg as empty, never "{name}"', () => {
    expect(formatIcu('Hi {name}.', {}, { locale: 'en' })).toBe('Hi .');
  });
});

describe('formatIcu — plural', () => {
  const pattern = '{count, plural, =0 {no items} one {1 item} other {{count} items}}';
  it('matches exact =0 before the category', () => {
    expect(formatIcu(pattern, { count: 0 }, { locale: 'en' })).toBe('no items');
  });
  it('uses the category for the rest', () => {
    expect(formatIcu(pattern, { count: 1 }, { locale: 'en' })).toBe('1 item');
    expect(formatIcu(pattern, { count: 5 }, { locale: 'en' })).toBe('5 items');
  });
  it('replaces # with the locale-formatted number', () => {
    const hash = '{count, plural, one {# view} other {# views}}';
    expect(formatIcu(hash, { count: 1 }, { locale: 'en' })).toBe('1 view');
    expect(formatIcu(hash, { count: 1500 }, { locale: 'af' })).toBe('1 500 views');
  });
  it('dispatches on the locale’s CLDR rule — 0 is "one" in isiZulu, "other" in English', () => {
    const two = '{n, plural, one {SINGLE} other {PLURAL}}';
    expect(formatIcu(two, { n: 0 }, { locale: 'zu' })).toBe('SINGLE');
    expect(formatIcu(two, { n: 0 }, { locale: 'en' })).toBe('PLURAL');
  });
  it('throws on a non-numeric plural arg instead of guessing', () => {
    expect(() => formatIcu('{n, plural, other {x}}', { n: 'abc' }, { locale: 'en' })).toThrow(TypeError);
  });
});

describe('formatIcu — select', () => {
  const pron = '{gender, select, male {He} female {She} other {They}}';
  it('picks the branch for the value', () => {
    expect(formatIcu(pron, { gender: 'female' }, { locale: 'en' })).toBe('She');
  });
  it('falls to other for an unknown value', () => {
    expect(formatIcu(pron, { gender: 'x' }, { locale: 'en' })).toBe('They');
  });
  it('nests plural inside select and interpolates', () => {
    const nested =
      '{gender, select, female {She saw {count, plural, one {# item} other {# items}}} other {{count, plural, one {They saw # item} other {They saw # items}}}}';
    expect(formatIcu(nested, { gender: 'female', count: 1 }, { locale: 'en' })).toBe('She saw 1 item');
    expect(formatIcu(nested, { gender: 'male', count: 3 }, { locale: 'en' })).toBe('They saw 3 items');
  });
});

describe('formatIcu — refuses constructs it does not implement', () => {
  it('throws on an unsupported argument type (no silent mis-render)', () => {
    expect(() => formatIcu('{x, number}', { x: 1 }, { locale: 'en' })).toThrow();
    expect(() => formatIcu('{x, number, integer}', { x: 1 }, { locale: 'en' })).toThrow();
  });
});
