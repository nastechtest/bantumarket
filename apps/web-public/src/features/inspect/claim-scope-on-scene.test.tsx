import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { fixtureManifest } from '../../lib/fixtures.js';
import { InspectStatic } from './inspect-error.js';
import { SceneOverlays } from './condition-overlay.js';
import { decideInspect } from './inspect-decision.js';
import { cap } from '../../test-support/test-caps.js';
import type { OverlayRootProps } from '@nastech/ui-3d/overlays';
import type { CaptionCamera, Viewport } from './scene-types.js';
import { createHarness, type RenderHarness } from '../../test-support/test-dom.js';

let h: RenderHarness;
const staticCap = cap({ gl: 'none' });
const camera: CaptionCamera = { position: [0.2, 0.1, 0.3], target: [0, 0.021, 0], up: [0, 1, 0], fovDeg: 32, aspect: 1, near: 0.01 };
const viewport: Viewport = { widthPx: 400, heightPx: 300 };

beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.reset());
afterAll(() => h.restore());

describe('claim scope is on the surface, persistent and non-closable', () => {
  it('the static inspection quotes the contract sentence byte-for-byte', () => {
    const plan = decideInspect(staticCap, fixtureManifest);
    const { container } = h.render(<InspectStatic manifest={fixtureManifest} alt="watch" plan={plan} />);
    expect(container.textContent).toContain(CLAIM_SCOPE_DISCLOSURE[fixtureManifest.claimScope]);
  });

  it('nothing in the static path can dismiss the claim scope', () => {
    const plan = decideInspect(staticCap, fixtureManifest);
    const { container } = h.render(<InspectStatic manifest={fixtureManifest} alt="watch" plan={plan} />);
    const closers = [...container.querySelectorAll('button, [role="button"]')].filter((el) =>
      /close|dismiss|hide|got it/i.test(el.textContent ?? el.getAttribute('aria-label') ?? ''),
    );
    expect(closers.length).toBe(0);
  });

  it('the scene overlay layer is handed the same claim scope the banner must render', () => {
    // The real ClaimScopeBanner's wording and its "no close affordance at all" are pinned by the
    // overlays package's own suite (brief-03). What the inspect surface owns is *that the scene is
    // given the scope to render* — assert the wiring forwards it, never a locally-typed paraphrase.
    const seen: OverlayRootProps[] = [];
    const FakeRoot = (props: OverlayRootProps) => {
      seen.push(props);
      return <div>{CLAIM_SCOPE_DISCLOSURE[props.claimScope]}</div>;
    };
    h.render(<SceneOverlays Root={FakeRoot} manifest={fixtureManifest} camera={camera} viewport={viewport} />);
    expect(seen[0]!.claimScope).toBe(fixtureManifest.claimScope);
    expect(seen[0]!.claimScope).toBe('geometry_and_external_condition');
  });
});
