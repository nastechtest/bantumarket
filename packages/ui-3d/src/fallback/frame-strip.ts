import type { AssetManifest, Rendition } from '@nastech/api-contracts';

/**
 * Per-frame geometry for the turntable (07 §4.4). The capture programme can deliver the 12-frame
 * spin two ways — one sprite sheet, or one image per frame — and the buyer must never scrub into an
 * empty cell either way. This module is the single source of truth for *which bytes exist*: the
 * preloader and the sprite both read it, so they cannot disagree about the frame count or the URLs.
 */

/** A rendition as it arrives from the media endpoint, where the short-TTL URL is attached at runtime. */
export type SourcedRendition = Rendition & { readonly signedUrl?: string };

/** The pilot standard. Real counts come from the capture; this is only the default when undeclared. */
export const TURNTABLE_FRAME_STANDARD = 12;

export type FrameStrip =
  | { readonly layout: 'sprite-sheet'; readonly url: string; readonly count: number }
  | { readonly layout: 'frame-images'; readonly urls: readonly string[] };

export interface SpriteFrameStyle {
  readonly backgroundImage: string;
  readonly backgroundSize: string;
  readonly backgroundPosition: string;
}

/**
 * Non-throwing sibling of `signedUrlFor`. A missing URL is a normal state on a slow network — the
 * fetch has not landed yet — so the render path inspects rather than catches.
 */
export function trySignedUrlFor(rendition: SourcedRendition | undefined): string | null {
  if (!rendition) return null;
  const url = rendition.signedUrl;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

function clampCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return TURNTABLE_FRAME_STANDARD;
  return Math.max(1, Math.floor(value));
}

export function clampFrame(index: number, count: number): number {
  const safeCount = clampCount(count);
  const wrapped = Number.isFinite(index) ? Math.floor(index) % safeCount : 0;
  return (wrapped + safeCount) % safeCount;
}

/**
 * The individual-frame delivery: SPRITE renditions in the `renditions` list, each one frame of the
 * spin, ordered as listed. When the programme ships a sheet instead, `manifest.sprite` carries it and
 * this list is empty.
 */
export function frameImageUrls(manifest: AssetManifest): readonly string[] {
  const urls: string[] = [];
  for (const rendition of manifest.renditions) {
    if (rendition.kind !== 'SPRITE') continue;
    const url = trySignedUrlFor(rendition as SourcedRendition);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Derive the strip. Precedence is a deliberate contract with the capture CLI: a sprite rendition with
 * a URL is one sheet; otherwise the turntable is whatever per-frame images are present; otherwise
 * there is no turntable and the caller shows the poster alone.
 */
export function deriveFrameStrip(manifest: AssetManifest, framesOverride?: number): FrameStrip | null {
  const sprite = manifest.sprite as SourcedRendition | undefined;
  const sheetUrl = trySignedUrlFor(sprite);
  if (sprite && sheetUrl) {
    return { layout: 'sprite-sheet', url: sheetUrl, count: clampCount(framesOverride ?? sprite.frames) };
  }
  const urls = frameImageUrls(manifest);
  return urls.length > 0 ? { layout: 'frame-images', urls } : null;
}

export function frameCount(strip: FrameStrip | null): number {
  if (!strip) return 0;
  return strip.layout === 'sprite-sheet' ? strip.count : strip.urls.length;
}

/** Every distinct byte range a scrub can demand. Preloading these is what makes the strip honest. */
export function preloadableUrls(strip: FrameStrip | null): readonly string[] {
  if (!strip) return [];
  if (strip.layout === 'sprite-sheet') return [strip.url];
  return [...new Set(strip.urls)];
}

export function frameUrlAt(strip: FrameStrip | null, index: number): string | null {
  if (!strip) return null;
  if (strip.layout === 'sprite-sheet') return strip.url;
  return strip.urls[clampFrame(index, strip.urls.length)] ?? null;
}

/**
 * Sheet frames run left-to-right, which is what the capture jig produces.
 *
 * The percentage is positive: CSS resolves `background-position-x: p%` against
 * `(containerWidth - imageWidth)`, and the scaled image is `count` containers wide, so the offset is
 * `(1 - count) * containerWidth * p` — negative, which is the direction that walks the strip.
 * `index / (count - 1)` is therefore the frame's position; `index / count` (or its negation) slides
 * the wrong way and stops one frame short.
 */
export function frameStyleAt(strip: FrameStrip | null, index: number): SpriteFrameStyle | null {
  if (!strip || strip.layout !== 'sprite-sheet') return null;
  const count = clampCount(strip.count);
  const frame = clampFrame(index, count);
  const position = count === 1 ? 0 : (frame / (count - 1)) * 100;
  return {
    backgroundImage: `url(${strip.url})`,
    backgroundSize: `${count * 100}% 100%`,
    backgroundPosition: `${position}% 0%`,
  };
}
