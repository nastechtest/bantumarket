import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import type { AssetManifest } from '@nastech/api-contracts';
import { fixtureManifest } from '../../lib/fixtures.js';
import { SceneOverlays, overlayBounds, disclosureBound } from './condition-overlay.js';
import type { OverlayRootProps } from '@nastech/ui-3d/overlays';
import type { CaptionCamera, Viewport } from './scene-types.js';
import { createHarness, type RenderHarness } from '../../test-support/test-dom.js';

let h: RenderHarness;
const camera: CaptionCamera = {
  position: [0.2, 0.1, 0.3],
  target: [0, 0.021, 0],
  up: [0, 1, 0],
  fovDeg: 32,
  aspect: 1,
  near: 0.01,
};
const viewport: Viewport = { widthPx: 400, heightPx: 300 };

beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.reset());
afterAll(() => h.restore());

/** A recording stand-in for the real `OverlayRoot` (which lives behind the CONTRACT-GAP subpath). */
function capturingRoot(seen: OverlayRootProps[]) {
  return (props: OverlayRootProps) => {
    seen.push(props);
    return <div data-testid="overlay-root" />;
  };
}

describe('SceneOverlays — binding the manifest to the ui-3d overlay layer', () => {
  it('renders nothing when no caption is bound to a disclosure record', () => {
    const manifest: AssetManifest = {
      ...fixtureManifest,
      captions: [{ hotspotId: 'hs_x', position: [0, 0, 0], disclosureText: 'orphan', severity: 'cosmetic', disclosureId: '  ' }],
    };
    const seen: OverlayRootProps[] = [];
    const { container } = h.render(<SceneOverlays Root={capturingRoot(seen)} manifest={manifest} camera={camera} viewport={viewport} />);
    expect(container.querySelector('[data-testid="overlay-root"]')).toBeNull();
    expect(seen.length).toBe(0);
  });

  it('forwards only disclosure-bound captions and never copies or synthesises them', () => {
    const manifest: AssetManifest = {
      ...fixtureManifest,
      captions: [
        { hotspotId: 'a', position: [0.01, 0, 0], disclosureText: 'bound', severity: 'cosmetic', disclosureId: 'dis_ok' },
        { hotspotId: 'b', position: [0, 0, 0], disclosureText: 'orphan', severity: 'cosmetic', disclosureId: '' },
      ],
    };
    const seen: OverlayRootProps[] = [];
    h.render(<SceneOverlays Root={capturingRoot(seen)} manifest={manifest} camera={camera} viewport={viewport} />);
    expect(seen.length).toBe(1);
    const forwarded = seen[0]!.captions;
    expect(forwarded.length).toBe(1);
    expect(forwarded[0]!.hotspotId).toBe('a');
    expect(disclosureBound(forwarded[0]!)).toBe(true);
  });

  it('passes the contract claim-scope and the capture metric alignment straight through', () => {
    const seen: OverlayRootProps[] = [];
    h.render(<SceneOverlays Root={capturingRoot(seen)} manifest={fixtureManifest} camera={camera} viewport={viewport} />);
    const props = seen[0]!;
    expect(props.claimScope).toBe(fixtureManifest.claimScope);
    expect(props.metersPerUnit).toBe(fixtureManifest.metricScaleMetersPerUnit);
    expect(props.camera).toBe(camera);
    expect(props.viewport).toBe(viewport);
  });

  it('derives the convex bounds from the metric alignment, not a guess', () => {
    const seen: OverlayRootProps[] = [];
    h.render(<SceneOverlays Root={capturingRoot(seen)} manifest={fixtureManifest} camera={camera} viewport={viewport} />);
    expect(seen[0]!.bounds.radiusUnits).toBeCloseTo(fixtureManifest.metricScaleMetersPerUnit * 0.55, 6);
    // The helper agrees with what the component sends — one source of truth for the hull.
    expect(overlayBounds(fixtureManifest).radiusUnits).toBe(seen[0]!.bounds.radiusUnits);
  });

  it('omits the calipers prop entirely when there are none (exactOptionalPropertyTypes discipline)', () => {
    const seen: OverlayRootProps[] = [];
    h.render(<SceneOverlays Root={capturingRoot(seen)} manifest={fixtureManifest} camera={camera} viewport={viewport} calipers={[]} />);
    expect('calipers' in seen[0]!).toBe(false);
  });
});
