import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLAIM_SCOPE_DISCLOSURE, TIER_LABELS } from '@nastech/api-contracts';
import { HAS_3D_MARKER_TEXT } from '@nastech/design-system';
import { ItemPageView } from '../item-page.js';
import { Gallery } from '../media/gallery.js';
import { fixtureDetail } from '../api/fixtures.js';
import { createFixtureItemTransport } from '../api/fixtures.js';
import { TURNTABLE_FRAME_COUNT } from '../api/item-transport.js';

/**
 * Rule one, machine-checked: the whole page, rendered in a process where the scene runtime does
 * not exist, still carries every condition claim *in text* and every flow except the 3D view —
 * which is a link, not a dependency. There is no `<canvas>` anywhere in the output, because the
 * page never asks for one.
 */

const transport = createFixtureItemTransport();
const detail = fixtureDetail('lst_01')!;
const html = renderToStaticMarkup(
  <ItemPageView detail={detail} transport={transport} canonicalBase="https://nastech.market" />,
);

describe('item page without any 3D capability', () => {
  it('the process really has no scene runtime: no window, no WebGL constructor', () => {
    expect(typeof (globalThis as Record<string, unknown>).WebGLRenderingContext).toBe('undefined');
    expect(typeof (globalThis as Record<string, unknown>).WebGL2RenderingContext).toBe('undefined');
  });

  it('renders without throwing and emits no canvas element', () => {
    expect(html.length).toBeGreaterThan(2000);
    expect(html).not.toContain('<canvas');
    expect(html.toLowerCase()).not.toContain('webgl');
  });

  it('every condition claim survives as text — the dispute process can read this page alone', () => {
    for (const record of detail.conditionRecords) {
      expect(html).toContain(record.text);
      expect(html).toContain(record.disclosureId);
    }
  });

  it('the claim-scope sentence is the contract sentence, verbatim', () => {
    expect(html).toContain(CLAIM_SCOPE_DISCLOSURE[detail.claimScope]);
  });

  it('tier, price, seller and buy path are all present with zero GL', () => {
    expect(html).toContain(TIER_LABELS[detail.seller.tier]);
    expect(html).toContain('R4,200');
    expect(html).toContain(detail.seller.displayName);
    expect(html).toContain('href="/checkout/lst_01"');
    expect(html).toContain(HAS_3D_MARKER_TEXT);
  });

  it('safety surface and policy links are part of the static page, not an add-on state', () => {
    expect(html).toContain('Meeting safely');
    expect(html).toContain('/legal/privacy');
  });

  it('the 12-frame turntable is rendered from photographs with an explicit frame count', () => {
    expect(html).toContain(`${TURNTABLE_FRAME_COUNT}-frame turntable`);
    const strip = renderToStaticMarkup(<Gallery detail={detail} initialMode="turntable" />);
    expect(strip).toContain('aria-valuemax="12"');
    expect(strip).toContain('aria-valuemin="1"');
    expect(strip).toContain('Frame 1 of 12');
    // And its strip image is a plain jpg, not a model:
    expect(strip).toContain('turntable-12.jpg');
  });

  it('a photos-only listing never opens the turntable tab, even if asked to', () => {
    const plain = fixtureDetail('lst_02')!;
    const strip = renderToStaticMarkup(<Gallery detail={plain} initialMode="turntable" />);
    expect(strip).not.toContain('12-frame turntable');
    expect(strip).toContain('aria-label="View photo 1:');
  });

  it('a no-capture listing (F-91W) renders the same complete page minus the 3D affordances', () => {
    const plain = fixtureDetail('lst_02')!;
    const plainHtml = renderToStaticMarkup(<ItemPageView detail={plain} transport={transport} />);
    expect(plainHtml).toContain(plain.conditionRecords[0]!.text);
    expect(plainHtml).not.toContain('/inspect');
    expect(plainHtml).not.toContain(HAS_3D_MARKER_TEXT);
    // No render exists, so the page must not utter the model-scope sentence at all.
    for (const sentence of Object.values(CLAIM_SCOPE_DISCLOSURE)) {
      expect(plainHtml).not.toContain(sentence);
    }
  });
});
