import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { OverlayRoot, hasVisibleOverlays } from './overlay-root.js';
import { CASE_BOUNDS, FRONT_CAMERA, VIEWPORT_400, makeCaption, textOf } from './overlay-fixtures.js';

const captions = [
  makeCaption('bezel-scratch', [0, 0, 0.02], { severity: 'cosmetic' }),
  makeCaption('caseback-dent', [0, 0, -0.02], { severity: 'functional' }), // far side: occluded
  makeCaption('crystal-unknown', [0, 0.01, 0.017], { severity: 'unknown' }),
  makeCaption('orphan-marker', [0.005, 0, 0.005], { disclosureId: '' }), // no record: nothing to show
];

function render() {
  return renderToStaticMarkup(
    <OverlayRoot
      captions={captions}
      claimScope="geometry_and_external_condition"
      metersPerUnit={1}
      camera={FRONT_CAMERA}
      viewport={VIEWPORT_400}
      bounds={CASE_BOUNDS}
      calipers={[{ id: 'case-width', from: [0, 0, 0], to: [0.038, 0, 0] }]}
    />,
  );
}

describe('<OverlayRoot/>', () => {
  test('caption without a disclosureId produces no marker at all, not even in aggregate', () => {
    const html = render();
    expect(html).not.toContain('orphan-marker');
    expect(hasVisibleOverlays({ captions: [captions[3]!] })).toBe(false);
    expect(hasVisibleOverlays({ captions })).toBe(true);
  });

  test('far-side hotspot is hidden; visible markers are the ones the facing test passes', () => {
    const html = render();
    expect(html).not.toContain('caseback-dent');
    expect(html).toContain('bezel-scratch');
    expect(html).toContain('crystal-unknown');
    expect(html.match(/<button/g)?.length).toBe(2);
  });

  test('orbit survives between markers: the plate swallows no pointer events, markers opt back in', () => {
    const html = render();
    expect(html).toMatch(/class="nt-overlay-root"[^>]*pointer-events:none/);
    expect(html).toMatch(/class="nt-callout"[^>]*pointer-events:auto/);
  });

  test('banner, legend, scale bar and calipers all ride the same DOM layer and stay selectable text', () => {
    const html = render();
    const text = textOf(html);
    expect(text).toContain(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
    expect(text).toContain('10 mm');
    expect(text).toContain('38.0 mm');
    expect(html).toContain('aria-label="Overlay legend"');
  });
});
