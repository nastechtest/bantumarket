import { describe, expect, it } from 'bun:test';
import {
  TURNTABLE_FRAME_STANDARD,
  clampFrame,
  deriveFrameStrip,
  frameCount,
  frameImageUrls,
  frameStyleAt,
  frameUrlAt,
  preloadableUrls,
  trySignedUrlFor,
} from './frame-strip.js';
import { manifest, sourced } from './test-fixtures.js';

describe('deriveFrameStrip — sprite sheet', () => {
  it('reads the frame count off the rendition rather than assuming it', () => {
    const strip = deriveFrameStrip(manifest())!;
    expect(strip.layout).toBe('sprite-sheet');
    expect(frameCount(strip)).toBe(12);
    expect(preloadableUrls(strip)).toEqual(['/signed/ren_sprite']);
  });

  it('defaults to the pilot standard when the capture did not declare frames', () => {
    const strip = deriveFrameStrip(manifest({ sprite: sourced('ren_sprite', 'SPRITE', { frames: undefined }) as never }))!;
    expect(frameCount(strip)).toBe(TURNTABLE_FRAME_STANDARD);
  });

  it('honours the caller override, which is what the grid thumbnail asks for', () => {
    const strip = deriveFrameStrip(manifest(), 4)!;
    expect(frameCount(strip)).toBe(4);
  });

  it('yields a position that walks the strip left-to-right, frame by frame', () => {
    const strip = deriveFrameStrip(manifest({ sprite: sourced('s', 'SPRITE', { frames: 4 }) as never }))!;
    const positionAt = (i: number) => Number.parseFloat(frameStyleAt(strip, i)!.backgroundPosition);
    expect(frameStyleAt(strip, 0)!.backgroundPosition).toBe('0% 0%');
    expect(frameStyleAt(strip, 3)!.backgroundPosition).toBe('100% 0%');
    // Frame i sits at i/(count-1) of the strip: monotonic, evenly spaced, and the last frame lands
    // exactly at 100% rather than one frame short of it.
    expect(positionAt(1)).toBeCloseTo(100 / 3, 6);
    expect(positionAt(2)).toBeCloseTo(200 / 3, 6);
    expect(positionAt(2) - positionAt(1)).toBeCloseTo(positionAt(1) - positionAt(0), 6);
    expect(frameStyleAt(strip, 0)!.backgroundSize).toBe('400% 100%');
  });

  it('wraps an out-of-range index instead of painting past the end of the sheet', () => {
    const strip = deriveFrameStrip(manifest({ sprite: sourced('s', 'SPRITE', { frames: 4 }) as never }))!;
    expect(frameStyleAt(strip, 4)!.backgroundPosition).toBe('0% 0%');
    expect(frameStyleAt(strip, -1)!.backgroundPosition).toBe('100% 0%');
  });

  it('does not emit a style for the per-frame layout', () => {
    const strip = deriveFrameStrip(
      manifest({ sprite: null, renditions: [sourced('f0', 'SPRITE') as never] }),
    )!;
    expect(frameStyleAt(strip, 0)).toBeNull();
  });
});

describe('deriveFrameStrip — one image per frame', () => {
  const perFrame = manifest({
    sprite: null,
    renditions: [
      sourced('f0', 'SPRITE') as never,
      sourced('f1', 'SPRITE') as never,
      sourced('f2', 'SPRITE') as never,
    ],
  });

  it('counts the frames from the renditions that exist', () => {
    const strip = deriveFrameStrip(perFrame)!;
    expect(strip.layout).toBe('frame-images');
    expect(frameCount(strip)).toBe(3);
  });

  it('preloads exactly the per-frame URLs, in listing order', () => {
    expect(preloadableUrls(deriveFrameStrip(perFrame)!)).toEqual(['/signed/f0', '/signed/f1', '/signed/f2']);
  });

  it('resolves a frame to its own URL, and wraps past the end', () => {
    const strip = deriveFrameStrip(perFrame)!;
    expect(frameUrlAt(strip, 1)).toBe('/signed/f1');
    expect(frameUrlAt(strip, 7)).toBe('/signed/f1');
  });

  it('skips frames whose URL has not landed and keeps the ones that have', () => {
    const partial = manifest({
      sprite: null,
      renditions: [
        sourced('f0', 'SPRITE') as never,
        sourced('f1', 'SPRITE', { signedUrl: undefined }) as never,
        sourced('f2', 'SPRITE') as never,
      ],
    });
    expect(frameImageUrls(partial)).toEqual(['/signed/f0', '/signed/f2']);
  });

  it('ignores MODEL and MACRO renditions — those are not turntable bytes', () => {
    const mixed = manifest({
      sprite: null,
      renditions: [
        sourced('ren_lod0', 'MODEL') as never,
        sourced('ren_macro', 'MACRO') as never,
        sourced('f0', 'SPRITE') as never,
      ],
    });
    expect(frameImageUrls(mixed)).toEqual(['/signed/f0']);
  });
});

describe('deriveFrameStrip — neither layout', () => {
  it('returns null when the sprite rendition has no URL and there are no frames', () => {
    const strip = deriveFrameStrip(
      manifest({ sprite: sourced('ren_sprite', 'SPRITE', { signedUrl: undefined }) as never, renditions: [] }),
    );
    expect(strip).toBeNull();
  });

  it('dedupes a sheet to one byte range so the preloader cannot fetch a sheet twelve times', () => {
    expect(preloadableUrls(deriveFrameStrip(manifest())!)).toHaveLength(1);
  });
});

describe('clamp helpers', () => {
  it('wraps negative and overflowing indices into range', () => {
    expect(clampFrame(-1, 12)).toBe(11);
    expect(clampFrame(12, 12)).toBe(0);
    expect(clampFrame(25, 12)).toBe(1);
    expect(clampFrame(NaN, 12)).toBe(0);
  });

  it('never produces a zero or fractional frame count', () => {
    expect(frameCount(null)).toBe(0);
    expect(preloadableUrls(null)).toEqual([]);
  });

  it('treats an empty signed URL as no URL', () => {
    expect(trySignedUrlFor(sourced('x', 'POSTER', { signedUrl: '' }))).toBeNull();
  });
});
