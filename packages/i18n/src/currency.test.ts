/**
 * ZAR formatting. The mandated cases (0, five cents, R999 999,99, a negative) are here, plus the
 * grouping boundary and the `Cents`-vs-`Money` forms, plus that a fractional cent is REJECTED rather
 * than rounded — the brand's whole reason to exist.
 */

import { describe, it, expect } from 'bun:test';
import { money, type Cents } from '@nastech/api-contracts';
import { formatCurrency } from './formatter/currency.js';

// The branded cent count, straight from the contract constructor — never a hand-written float.
const cents = (n: number): Cents => money(n).cents;

describe('formatCurrency — en-ZA (comma group, dot decimal)', () => {
  it('renders the mandated amounts', () => {
    expect(formatCurrency(cents(0), 'en')).toBe('R0.00');
    expect(formatCurrency(cents(5), 'en')).toBe('R0.05');
    expect(formatCurrency(cents(99999999), 'en')).toBe('R999,999.99');
    expect(formatCurrency(cents(-125000), 'en')).toBe('-R1,250.00');
  });

  it('always shows two decimals and groups thousands with a comma', () => {
    expect(formatCurrency(cents(100), 'en')).toBe('R1.00');
    expect(formatCurrency(cents(999), 'en')).toBe('R9.99');
    expect(formatCurrency(cents(125000), 'en')).toBe('R1,250.00');
    expect(formatCurrency(cents(100000000), 'en')).toBe('R1,000,000.00');
    expect(formatCurrency(cents(999999999), 'en')).toBe('R9,999,999.99');
  });
});

describe('formatCurrency — af-ZA (space group, comma decimal)', () => {
  it('renders the mandated amounts the way Afrikaans readers expect', () => {
    expect(formatCurrency(cents(0), 'af')).toBe('R0,00');
    expect(formatCurrency(cents(5), 'af')).toBe('R0,05');
    expect(formatCurrency(cents(125000), 'af')).toBe('R1 250,00');
    expect(formatCurrency(cents(99999999), 'af')).toBe('R999 999,99');
    expect(formatCurrency(cents(-125000), 'af')).toBe('-R1 250,00');
    expect(formatCurrency(cents(999999999), 'af')).toBe('R9 999 999,99');
  });

  it('isiZulu and isiXhosa follow the same space-group / comma-decimal convention as Afrikaans', () => {
    expect(formatCurrency(cents(125000), 'zu')).toBe('R1 250,00');
    expect(formatCurrency(cents(125000), 'xh')).toBe('R1 250,00');
  });
});

describe('formatCurrency — accepts Cents and Money, and rejects a float', () => {
  it('takes a full Money as well as the branded cents', () => {
    expect(formatCurrency(money(125000), 'en')).toBe('R1,250.00');
    expect(formatCurrency(money(-420000), 'af')).toBe('-R4 200,00');
  });

  it('throws on a fractional cent instead of silently rounding (the brand guard)', () => {
    // `as Cents` here is the test deliberately defeating the type to prove the runtime guard holds.
    expect(() => formatCurrency(1250.5 as Cents, 'en')).toThrow(TypeError);
    expect(() => formatCurrency(0.5 as Cents, 'en')).toThrow(TypeError);
  });

  it('supports the accounting (parenthesised) negative form for statement rows', () => {
    expect(formatCurrency(cents(-125000), 'af', { accountingNegative: true })).toBe('(R1 250,00)');
    expect(formatCurrency(cents(125000), 'af', { accountingNegative: true })).toBe('R1 250,00');
  });
});
