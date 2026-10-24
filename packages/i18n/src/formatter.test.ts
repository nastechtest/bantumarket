/**
 * Number + unit formatting — the shared grouping primitive behind currency and the plural engine, and
 * the SI measurements a listing shows. Grouping boundaries and the space-vs-comma locale split are the
 * behaviour worth pinning.
 */

import { describe, it, expect } from 'bun:test';
import { formatNumber } from './formatter/number.js';
import { formatUnit, formatCaseSize } from './formatter/units.js';

describe('formatNumber', () => {
  it('groups thousands per locale', () => {
    expect(formatNumber(1250000, 'en')).toBe('1,250,000');
    expect(formatNumber(1250000, 'af')).toBe('1 250 000');
    expect(formatNumber(1250000, 'zu')).toBe('1 250 000');
  });
  it('renders decimals with the locale decimal separator and fixed width', () => {
    expect(formatNumber(0.5, 'en', { fractionDigits: 2 })).toBe('0.50');
    expect(formatNumber(0.5, 'af', { fractionDigits: 2 })).toBe('0,50');
  });
  it('keeps a negative sign and can suppress grouping', () => {
    expect(formatNumber(-1234.5, 'en')).toBe('-1,234.5');
    expect(formatNumber(1234, 'en', { useGrouping: false })).toBe('1234');
  });
});

describe('formatUnit / formatCaseSize', () => {
  it('appends the SI symbol unchanged (units do not pluralise)', () => {
    expect(formatUnit(42, 'mm', 'af')).toBe('42 mm');
    expect(formatUnit(1250, 'g', 'af')).toBe('1 250 g');
    expect(formatUnit(0.5, 'kg', 'en')).toBe('0.5 kg');
  });
  it('renders a watch case size to one decimal, locale-separated', () => {
    expect(formatCaseSize(42, 'af')).toBe('42,0 mm');
    expect(formatCaseSize(40, 'en')).toBe('40.0 mm');
  });
});
