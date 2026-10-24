import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import type { RouteDef } from '../router.js';
import Home from '../routes/Home.js';
import { STATIC_REASON_TEXT } from '../features/inspect/inspect-decision.js';
import { createHarness, type RenderHarness } from '../test-support/test-dom.js';

/**
 * The Home route's no-WebGL fallback, asserted at route level rather than inside `features/brand`.
 *
 * The behaviour spans two owners: the brand hero decides whether a scene may be fetched, and the
 * inspect decision module owns the one sentence that tells a buyer why the photographs are showing
 * instead. Only a non-feature file may import both, which is exactly what a route module is — so
 * this is where the pairing gets proven, and `brand-scene.test.tsx` stays about brand's components.
 */

let h: RenderHarness;
beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.reset());

const brandRoute: RouteDef = { path: '/', class: 'brand', label: 'Home' };

describe('home route without a 3D-capable browser', () => {
  it('shows the honest one-line reason and offers no 3D button', () => {
    const { container } = h.render(<Home route={brandRoute} />);
    expect(container.querySelector('canvas')).toBeNull();
    // jsdom has no WebGL, so canFetchScene is false and the reason is "no-webgl".
    expect(container.textContent).toContain(STATIC_REASON_TEXT['no-webgl']);
    expect([...container.querySelectorAll('button')].some((b) => /view in 3d/i.test(b.textContent ?? ''))).toBe(false);
  });
});
