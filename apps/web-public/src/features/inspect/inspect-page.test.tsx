import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import type { RouteDef } from '../../router.js';
import { InspectPage } from './inspect-page.js';
import { createHarness, type RenderHarness } from '../../test-support/test-dom.js';

let h: RenderHarness;
const route: RouteDef = { path: '/item/:id/inspect', class: 'scene', label: 'Inspect in 3D' };

beforeAll(async () => {
  h = await createHarness();
});
afterEach(() => h.reset());
afterAll(() => h.restore());

describe('InspectPage — the default jsdom environment has no WebGL', () => {
  it('renders the complete static path and no canvas', () => {
    const { container } = h.render(<InspectPage route={route} />);
    // The turntable + condition table are present, proving "sufficient, not a grey box".
    expect(container.querySelector('img.nt-poster')).toBeTruthy();
    expect(container.querySelector('.nt-condition')).toBeTruthy();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('states a one-line reason and quotes the claim scope', () => {
    const { container } = h.render(<InspectPage route={route} />);
    expect(container.querySelector('.nt-quality--static')).toBeTruthy();
    expect(container.textContent).toContain(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
  });

  it('labels the geometry provenance as a placeholder', () => {
    const { container } = h.render(<InspectPage route={route} />);
    expect(container.querySelector('.nt-capture-meta__placeholder')).toBeTruthy();
  });

  it('does not spin or grey out — the reason is a status, not an error', () => {
    const { container } = h.render(<InspectPage route={route} />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/failed|broken|unavailable to render/i);
  });
});
