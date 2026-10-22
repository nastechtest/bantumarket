import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { money } from '@nastech/api-contracts';
import type { ListingSummary } from '@nastech/api-contracts';
import { ListingCard, HAS_3D_MARKER_TEXT } from '../card.js';

function listing(overrides: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: 'L1',
    title: 'Seiko 5 automatic',
    price: money(420000),
    categorySlug: 'watches',
    sellerTier: 'T1',
    has3d: true,
    posterUrl: '/posters/l1.jpg',
    ...overrides,
  };
}

describe('ListingCard', () => {
  it('shows price in SA format with tabular numerals and the tier chip verbatim', () => {
    const markup = renderToStaticMarkup(<ListingCard listing={listing()} />);
    expect(markup).toContain('R4,200');
    expect(markup).toContain('tabular-nums');
    expect(markup).toContain('Seller stated');
    expect(markup).toContain('data-tier="T1"');
  });

  it('words the capture marker as a fact, never as a glowing badge', () => {
    const markup = renderToStaticMarkup(<ListingCard listing={listing()} />);
    expect(markup).toContain(HAS_3D_MARKER_TEXT);
    expect(HAS_3D_MARKER_TEXT).toBe('3D inspected');
    // A fact, not a claim of assurance: plain text, no badge element around it, no glow.
    expect(markup).not.toContain('boxShadow');
    expect(markup).not.toContain('box-shadow');
    expect(markup).toMatch(/<span[^>]*data-marker="has3d"[^>]*>3D inspected<\/span>/);
  });

  it('omits the marker entirely when there is no capture — absence is information', () => {
    const markup = renderToStaticMarkup(<ListingCard listing={listing({ has3d: false })} />);
    expect(markup).not.toContain('3D');
  });

  it('renders the poster slot as plain img — the static path needs no GL', () => {
    const markup = renderToStaticMarkup(<ListingCard listing={listing()} />);
    expect(markup).toContain('<img');
    expect(markup).toContain('alt="Seiko 5 automatic"');
    expect(markup).not.toContain('canvas');
  });
});
