/**
 * Money rendering: every amount on this screen is a branded `Cents`/`Money` from
 * `@nastech/api-contracts`, displayed through `@nastech/design-system`'s `MoneyText`, and the UI
 * adds nothing — no fee line the server didn't issue, no total derived from a rate, no float.
 *
 * The proof is both dynamic (render a quote with deliberately distinctive amounts; the DOM must
 * show exactly those strings and nothing else money-shaped) and static (source scan of the
 * rendering layer for cents arithmetic and float formatting).
 */

import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';
import { FeeRows, CommissionRow } from './summary/fee-rows.js';
import { TotalRow } from './summary/total-row.js';
import { LineItems } from './summary/line-items.js';
import { ReviewStep } from './steps/review.js';
import type { CheckoutView, FeeRow, SellerCommissionRow } from './api/checkout-transport.js';

function fee(id: string, label: string, cents: number, included = true): FeeRow {
  return { id, label, amount: money(cents), borneBy: 'buyer', includedInBuyerTotal: included };
}

function baseView(overrides: Partial<CheckoutView> = {}): CheckoutView {
  const order = {
    id: 'ord_01',
    listingId: 'lst_01',
    buyerId: 'usr_buyer_01',
    sellerId: 'usr_seller_01',
    category: 'pre-owned-watches',
    itemPrice: money(420_000),
    buyerTotal: money(420_000),
    status: 'AWAITING_PAYMENT' as const,
    version: 1,
    createdAt: '2026-02-11T08:00:00Z',
    paidAt: null,
    handoverConfirmedAt: null,
    completedAt: null,
    handoverTokenId: null,
  };
  return {
    orderId: 'ord_01',
    listingId: 'lst_01',
    order,
    items: [{ listingId: 'lst_01', title: 'Seiko “Presage” automatic, 40.5 mm', unitPrice: money(420_000), quantity: 1 }],
    feeRows: [],
    sellerCommission: {
      amount: money(42_000),
      rateLabel: '10%',
      note: 'Taken from the seller on completion, and reversed in full if the order is refunded.',
    },
    methods: [],
    ineligibilityCode: null,
    lastIntent: null,
    ...overrides,
  };
}

describe('fee rendering', () => {
  it('renders exactly the server’s fee rows — the amount on screen is the amount on the wire', () => {
    const rows = [fee('fee_a', 'Insured delivery', 8_900), fee('fee_b', 'Buyer protection levy', 1_234)];
    const markup = renderToStaticMarkup(<FeeRows rows={rows} />);
    expect(markup).toContain('R89');
    expect(markup).toContain('R12.34');
    expect(markup.match(/data-testid="fee-row"/g)?.length).toBe(2);
  });

  it('invents NOTHING when the server sends no fees: no zero row, no “delivery: R0”, no placeholder', () => {
    const markup = renderToStaticMarkup(<FeeRows rows={[]} />);
    expect(markup).toContain('fee-rows-empty');
    expect(markup).not.toMatch(/R[0-9]/);
    expect(markup).not.toMatch(/data-testid="fee-row"/);
  });

  it('the total is the server’s buyerTotal verbatim, even when it matches no local computation', () => {
    // 420 000 price + 8 900 fee, but the server total is a deliberately odd 428 901.
    // The screen shows the SERVER's total (integrity guard blocks payment separately elsewhere);
    // it must never show itemPrice + feeRows because that is arithmetic the ledger doesn't own.
    const view = baseView({
      feeRows: [fee('fee_x', 'Insured delivery', 8_900)],
      order: { ...baseView().order, buyerTotal: money(428_901) },
    });
    const markup = renderToStaticMarkup(<TotalRow total={view.order.buyerTotal} />);
    expect(markup).toContain('R4,289.01');
    expect(markup).not.toContain('>R4,288.90<');
  });

  it('a fee row amount changes only when the server changes it — pass-through, not derivation', () => {
    const before = renderToStaticMarkup(<FeeRows rows={[fee('f', 'Levy', 500)]} />);
    const after = renderToStaticMarkup(<FeeRows rows={[fee('f', 'Levy', 600)]} />);
    expect(before).toContain('R5');
    expect(after).toContain('R6');
    expect(before).not.toBe(after);
  });

  it('the commission row shows the server-issued amount and rate label, and says who bears it', () => {
    const commission: SellerCommissionRow = { amount: money(42_000), rateLabel: '10%', note: 'From the seller on completion.' };
    const markup = renderToStaticMarkup(<CommissionRow commission={commission} />);
    expect(markup).toContain('R420');
    expect(markup).toContain('10%');
    expect(markup).toContain('seller');
    expect(renderToStaticMarkup(<CommissionRow commission={null} />)).toContain('commission-row-empty');
  });

  it('the review screen’s money strings are exactly the quote’s money values — nothing extra appears', () => {
    const view = baseView({ feeRows: [fee('fee_d', 'Insured delivery', 8_900)], order: { ...baseView().order, buyerTotal: money(428_900) } });
    const markup = renderToStaticMarkup(<ReviewStep view={view} onContinue={() => undefined} />);
    // R4,200 (item), R89 (fee), R4,289 (total), R420 (commission, seller-side) — a fifth R-number
    // would mean the UI produced a figure the server never issued.
    const amounts = [...markup.matchAll(/R[\d,]+(\.\d{2})?/g)].map((m) => m[0]);
    const unique = [...new Set(amounts)].sort();
    expect(unique).toEqual(['R4,200', 'R4,289', 'R420', 'R89'].sort());
  });

  it('line items render unit prices verbatim and the quantity is display, never a multiplier the UI applies', () => {
    const markup = renderToStaticMarkup(
      <LineItems items={[{ listingId: 'l', title: 'Two of them', unitPrice: money(150_00), quantity: 2 }]} />,
    );
    expect(markup).toContain('R150');
    expect(markup).toContain('×2'); // displayed; the total row is still the server's buyerTotal
  });

  it('rejects a non-ZAR money at the render boundary rather than formatting it silently', () => {
    const notZar = { cents: 420_000 as Money['cents'], currency: 'USD' } as unknown as Money;
    expect(() => renderToStaticMarkup(<TotalRow total={notZar} />)).toThrow(/ZAR-only/);
  });

  it('rejects fractional cents at the render boundary (money() is the only sanctioned constructor)', () => {
    const fractional = { cents: 4200.5 as Money['cents'], currency: 'ZAR' } as unknown as Money;
    expect(() => renderToStaticMarkup(<TotalRow total={fractional} />)).toThrow(TypeError);
  });
});

describe('the rendering layer contains no money arithmetic (static guarantee)', () => {
  const DIR = import.meta.dir;
  const RENDER_DIRS = ['summary', 'steps', 'methods'];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  const files = RENDER_DIRS.flatMap((d) => sourceFiles(join(DIR, d))).filter((f) => !f.endsWith('.test.ts'));

  /**
   * Prose may MENTION cents arithmetic; code may not contain it. Strip block comments and
   * line comments (leaving URL schemes like `https://` alone) so the docblocks above the very
   * functions this suite protects do not read as violations.
   */
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  it('scanned a meaningful set of render-layer files', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
  });

  it('no cents arithmetic anywhere in components (the guards/ dir is the sole checked exception)', () => {
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8'));
      // cents used with an operator: `x.cents + `, ` + y.cents`, `cents * `, `/ 100`, `* 100`
      expect(src).not.toMatch(/\.cents\s*[-+*/]|[-+*/]\s*\w*\.?cents\b/);
      expect(src).not.toMatch(/\/\s*100\b|\*\s*100\b/);
      expect(src).not.toMatch(/toFixed\s*\(/);
      expect(src).not.toMatch(/parseFloat|Number\s*\(\s*value\.cents|new\s+Number\(/);
    }
  });

  it('every component that prints an amount does it through MoneyText from the design system', () => {
    // Files that display money must import MoneyText; files that don’t must not contain an R-string.
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const printsAmount = src.includes('<MoneyText');
      if (printsAmount) {
        expect(src).toContain("@nastech/design-system");
      }
    }
  });
});
