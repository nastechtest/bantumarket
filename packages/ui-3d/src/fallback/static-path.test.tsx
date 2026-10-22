import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { PosterFallback, TurntableSprite, signedUrlFor } from './static-path.js';
import { createRenderHarness, teardownHarness, type RenderHarness } from './test-dom.js';
import { manifest, sourced } from './test-fixtures.js';

let h: RenderHarness;

beforeAll(async () => {
  h = await createRenderHarness();
});
afterEach(() => h.reset());
afterAll(() => teardownHarness());

describe('PosterFallback', () => {
  it('renders the poster from its signed URL with dimensions and alt text', () => {
    const { container } = h.render(<PosterFallback manifest={manifest()} alt="Seiko Presage, studio poster" />);
    const img = container.querySelector('img.nt-poster');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('/signed/ren_poster');
    expect(img!.getAttribute('alt')).toBe('Seiko Presage, studio poster');
    expect(img!.getAttribute('width')).toBe('1200');
    expect(img!.getAttribute('fetchpriority')).toBe('auto');
  });

  it('paints no canvas and needs no GL context', () => {
    const { container } = h.render(<PosterFallback manifest={manifest()} alt="Presage" />);
    expect(container.querySelector('canvas')).toBeNull();
    expect(typeof (globalThis as Record<string, unknown>)['WebGLRenderingContext']).toBe('undefined');
  });

  it('degrades to the unavailable-image state instead of throwing when the URL has not landed', () => {
    const m = manifest({ poster: sourced('ren_poster', 'POSTER', { signedUrl: undefined }) as never });
    const { container } = h.render(<PosterFallback manifest={m} alt="Presage" />);
    const box = container.querySelector('.nt-poster--missing');
    expect(box).toBeTruthy();
    expect(box!.getAttribute('aria-label')).toContain('image unavailable');
  });
});

describe('TurntableSprite', () => {
  it('paints the sprite sheet as a 12-frame strip with no canvas', () => {
    const { container } = h.render(<TurntableSprite manifest={manifest()} alt="Presage turntable" />);
    const sprite = container.querySelector('.nt-sprite') as HTMLElement;
    expect(sprite.style.backgroundSize).toBe('1200% 100%');
    expect(sprite.style.backgroundImage).toContain('/signed/ren_sprite');
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('announces the frame the buyer is on and walks forward on ArrowRight', () => {
    const { container } = h.render(<TurntableSprite manifest={manifest()} alt="Presage" />);
    const sprite = container.querySelector('.nt-sprite') as HTMLElement;
    expect(sprite.getAttribute('aria-label')).toBe('Presage — frame 1 of 12, drag to rotate');
    h.rtl.fireEvent.keyDown(sprite, { key: 'ArrowRight' });
    expect(sprite.getAttribute('aria-label')).toBe('Presage — frame 2 of 12, drag to rotate');
  });

  it('wraps at both ends instead of dead-ending the scrub', () => {
    const { container } = h.render(<TurntableSprite manifest={manifest()} alt="Presage" />);
    const sprite = container.querySelector('.nt-sprite') as HTMLElement;
    h.rtl.fireEvent.keyDown(sprite, { key: 'ArrowLeft' });
    expect(sprite.getAttribute('aria-label')).toContain('frame 12 of 12');
    h.rtl.fireEvent.keyDown(sprite, { key: 'ArrowRight' });
    expect(sprite.getAttribute('aria-label')).toContain('frame 1 of 12');
  });

  it('swaps image src when the capture delivered one image per frame', () => {
    const m = manifest({
      sprite: null,
      renditions: [
        sourced('f0', 'SPRITE') as never,
        sourced('f1', 'SPRITE') as never,
        sourced('f2', 'SPRITE') as never,
      ],
    });
    const { container } = h.render(<TurntableSprite manifest={m} alt="Presage" />);
    const img = container.querySelector('img.nt-sprite__frame');
    expect(img!.getAttribute('src')).toBe('/signed/f0');
    h.rtl.fireEvent.keyDown(container.querySelector('.nt-sprite') as HTMLElement, { key: 'ArrowRight' });
    expect(container.querySelector('img.nt-sprite__frame')!.getAttribute('src')).toBe('/signed/f1');
  });

  it('falls back to the poster when there is no turntable at all', () => {
    const m = manifest({ sprite: null, renditions: [] });
    const { container } = h.render(<TurntableSprite manifest={m} alt="Presage" />);
    expect(container.querySelector('.nt-sprite')).toBeNull();
    expect(container.querySelector('img.nt-poster')!.getAttribute('src')).toBe('/signed/ren_poster');
  });
});

describe('signedUrlFor', () => {
  it('refuses to invent a bucket URL', () => {
    expect(() => signedUrlFor(sourced('ren_lod0', 'MODEL', { signedUrl: undefined }) as never)).toThrow(
      /never construct a bucket URL client-side/,
    );
  });

  it('returns the signed URL the endpoint issued, untouched', () => {
    expect(signedUrlFor(sourced('ren_lod0', 'MODEL'))).toBe('/signed/ren_lod0');
  });
});
