import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { fixtureManifest, fixtureListings } from '../../lib/fixtures.js';
import { CategoryShowcase, HeroPoster, HeroScene } from '../brand/index.js';
import { cap } from '../../test-support/test-caps.js';
import { createHarness, type RenderHarness } from '../../test-support/test-dom.js';

let h: RenderHarness;
beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.reset());

describe('brand surfaces are flat and opt-in by tap', () => {
  it('the hero poster shows a photograph and no canvas', () => {
    const { container } = h.render(
      <HeroPoster manifest={fixtureManifest} alt="watch" heading="See the thing before you buy it." blurb="Every pre-owned watch…" />,
    );
    expect(container.querySelector('img.nt-poster')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('the hero scene requests nothing until the buyer taps, and never a canvas before then', () => {
    const { container } = h.render(
      <HeroScene manifest={fixtureManifest} alt="watch" capability={cap({ gl: 'none' })} requested={false} />,
    );
    expect(container.textContent).toContain('Showing the photograph');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('the category showcase renders three categories and the pilot listings', () => {
    const { container } = h.render(<CategoryShowcase listings={fixtureListings} />);
    expect(container.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(container.querySelectorAll('.card').length).toBeGreaterThan(0);
  });
});
