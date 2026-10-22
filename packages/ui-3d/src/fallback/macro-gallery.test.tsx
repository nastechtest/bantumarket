import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { MacroGallery, macroSlides, slideIndexForKey, stepSlide } from './macro-gallery.js';
import { createRenderHarness, teardownHarness, type RenderHarness } from './test-dom.js';
import { caption, manifest, sourced } from './test-fixtures.js';

let h: RenderHarness;
beforeAll(async () => {
  h = await createRenderHarness();
});
afterEach(() => h.reset());
afterAll(() => teardownHarness());

const macroManifest = manifest({
  renditions: [
    sourced('hs_bezel', 'MACRO') as never,
    sourced('hs_crystal', 'MACRO') as never,
    sourced('ren_lod1', 'MODEL') as never,
  ],
  captions: [
    caption('hs_bezel', 'cosmetic', 'One hairline at 2 o’clock on the bezel.', 'dis_01'),
    caption('hs_crystal', 'unknown', 'Crystal replaced by the previous owner.', 'dis_02'),
  ],
});

describe('macroSlides', () => {
  it('binds each photograph to the disclosure record the 3D callout points at', () => {
    const slides = macroSlides(macroManifest);
    expect(slides).toHaveLength(2);
    expect(slides[0]!.caption!.disclosureId).toBe('dis_01');
    expect(slides[1]!.caption!.disclosureId).toBe('dis_02');
  });

  it('excludes the model bytes — a macro is a claim about a flaw, not a second angle', () => {
    expect(macroSlides(macroManifest).map((s) => s.id)).toEqual(['hs_bezel', 'hs_crystal']);
  });

  it('keeps the slide when the URL has not landed, because the caption is the evidence', () => {
    const partial = manifest({
      renditions: [sourced('hs_bezel', 'MACRO', { signedUrl: undefined }) as never],
      captions: [caption('hs_bezel', 'cosmetic', 'A hairline.', 'dis_01')],
    });
    expect(macroSlides(partial)).toHaveLength(1);
    expect(macroSlides(partial)[0]!.url).toBeNull();
  });
});

describe('stepSlide / slideIndexForKey', () => {
  it('wraps in both directions', () => {
    expect(stepSlide(0, -1, 12)).toBe(11);
    expect(stepSlide(11, 1, 12)).toBe(0);
    expect(stepSlide(0, 0, 0)).toBe(0);
  });

  it('answers the keys a carousel should, and declines the ones it should not', () => {
    expect(slideIndexForKey('ArrowRight', 1, 5)).toBe(2);
    expect(slideIndexForKey('ArrowLeft', 0, 5)).toBe(4);
    expect(slideIndexForKey('Home', 3, 5)).toBe(0);
    expect(slideIndexForKey('End', 3, 5)).toBe(4);
    expect(slideIndexForKey('Tab', 3, 5)).toBeNull();
  });
});

describe('MacroGallery', () => {
  it('renders a keyboard-navigable set with no canvas and no WebGL', () => {
    const { container } = h.render(<MacroGallery manifest={macroManifest} />);
    expect(container.querySelector('canvas')).toBeNull();
    const region = container.querySelector('[role="group"]')!;
    expect(region.getAttribute('aria-roledescription')).toBe('carousel');
    expect(region.getAttribute('tabindex')).toBe('0');
    // One photograph painted at a time: a low-end device should not decode two macros to show one.
    expect(container.querySelectorAll('img.nt-macro__image')).toHaveLength(1);
    expect(container.querySelectorAll('.nt-macro__dots button')).toHaveLength(2);
  });

  it('moves on the arrow keys and announces the move to a screen reader', () => {
    const { container } = h.render(<MacroGallery manifest={macroManifest} />);
    const region = container.querySelector('[role="group"]')!;
    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toContain('Detail 1 of 2');
    expect(status.textContent).toContain('hairline');
    h.rtl.fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(status.textContent).toContain('Detail 2 of 2');
    expect(status.textContent).toContain('Crystal replaced');
    expect(container.querySelector('figcaption')!.textContent).toContain('dis_02');
  });

  it('shows the written note even when the photograph is missing', () => {
    const partial = manifest({
      sprite: null,
      renditions: [sourced('hs_bezel', 'MACRO', { signedUrl: undefined }) as never],
      captions: [caption('hs_bezel', 'cosmetic', 'A hairline at 2 o’clock.', 'dis_01')],
    });
    const { container } = h.render(<MacroGallery manifest={partial} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.nt-macro__caption')!.textContent).toContain('A hairline at 2 o’clock.');
    expect(container.querySelector('.nt-macro__record')!.textContent).toContain('dis_01');
  });

  it('treats a long drag as a swipe and a short one as a tap', () => {
    const { container } = h.render(<MacroGallery manifest={macroManifest} />);
    const region = container.querySelector('[role="group"]')!;
    h.rtl.fireEvent.pointerDown(region, { clientX: 200, pointerId: 1 });
    h.rtl.fireEvent.pointerUp(region, { clientX: 100, pointerId: 1 });
    expect(container.querySelector('[role="status"]')!.textContent).toContain('Detail 2 of 2');
    h.rtl.fireEvent.pointerDown(region, { clientX: 100, pointerId: 1 });
    h.rtl.fireEvent.pointerUp(region, { clientX: 90, pointerId: 1 });
    expect(container.querySelector('[role="status"]')!.textContent).toContain('Detail 2 of 2');
  });

  it('renders nothing at all when there are no macros, leaving the condition table as the record', () => {
    const { container } = h.render(<MacroGallery manifest={manifest()} />);
    expect(container.querySelector('.nt-macro')).toBeNull();
  });
});
