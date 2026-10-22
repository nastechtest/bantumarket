import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { money } from '@nastech/api-contracts';
import { formatZar, formatCents, formatZarRefunded } from '../format.js';
import { MoneyText } from '../money.js';

describe('formatZar', () => {
  it('formats 420000 cents as R4,200 with no decimal noise', () => {
    expect(formatZar(money(420000))).toBe('R4,200');
  });

  it('groups thousands and keeps decimals only when there are cents', () => {
    expect(formatZar(money(123456))).toBe('R1,234.56');
    expect(formatZar(money(123400))).toBe('R1,234');
    expect(formatZar(money(99))).toBe('R0.99');
    expect(formatZar(money(0))).toBe('R0');
    expect(formatZar(money(1000000000))).toBe('R10,000,000');
  });

  it('renders negatives with a leading minus', () => {
    expect(formatZar(money(-420000))).toBe('-R4,200');
    expect(formatZar(money(-420050))).toBe('-R4,200.50');
  });

  it('renders the refunded accounting form used by seller statements', () => {
    expect(formatZarRefunded(money(-420000))).toBe('(R4,200)');
    expect(formatZarRefunded(money(420000))).toBe('R4,200');
  });

  it('routes raw cents through the contract money() constructor', () => {
    expect(formatCents(420000)).toBe('R4,200');
    // money() rejects fractional cents; formatting must inherit that, not paper over it.
    expect(() => formatCents(4200.5)).toThrow(TypeError);
  });
});

describe('MoneyText', () => {
  it('carries tabular numerals so statement columns align', () => {
    const markup = renderToStaticMarkup(<MoneyText value={money(420000)} />);
    expect(markup).toContain('R4,200');
    expect(markup).toContain('tabular-nums');
  });

  it('renders the refunded form on request', () => {
    const markup = renderToStaticMarkup(<MoneyText value={money(-420000)} refunded />);
    expect(markup).toContain('(R4,200)');
  });
});
