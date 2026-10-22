import { useState } from 'react';
import type { AssetManifest, Rendition } from '@nastech/api-contracts';
import {
  TURNTABLE_FRAME_STANDARD,
  clampFrame,
  deriveFrameStrip,
  frameCount,
  frameStyleAt,
  frameUrlAt,
  trySignedUrlFor,
  type SourcedRendition,
} from './frame-strip.js';

/**
 * The static path (07 §4.4). It is *sufficient, not inferior*: the poster and the turntable sprite
 * come from the same capture session as the model, carry the same condition disclosures, and are
 * the primary delivery for the low-end cohort — not an apology rendered when 3D fails.
 */

export interface PosterFallbackProps {
  readonly manifest: AssetManifest;
  readonly alt: string;
  readonly eager?: boolean;
  readonly children?: React.ReactNode;
}

export function PosterFallback({ manifest, alt, eager = false, children }: PosterFallbackProps) {
  const [failed, setFailed] = useState(false);
  const url = trySignedUrlFor(manifest.poster as SourcedRendition);
  // An unlanded URL is the same buyer-visible state as a broken image, and it must not throw: the
  // condition text is the dispute artefact and it sits beside this element.
  if (failed || !url) {
    return (
      <div className="nt-poster nt-poster--missing" role="img" aria-label={`${alt} (image unavailable)`}>
        <span>{children ?? null}</span>
      </div>
    );
  }
  return (
    <img
      className="nt-poster"
      src={url}
      alt={alt}
      width={manifest.poster.widthPx}
      height={manifest.poster.heightPx}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
      onError={() => setFailed(true)}
    />
  );
}

export interface TurntableSpriteProps {
  readonly manifest: AssetManifest;
  readonly alt: string;
  /** Frames come from the capture, not invented here; a 12-frame spin is the pilot standard. */
  readonly frames?: number;
  readonly play?: boolean;
}

/**
 * Turntable scrubber. Dragging scrubs frames; releasing returns to the current frame rather than
 * auto-playing, because an unattended loop on a listing grid is motion the buyer did not ask for and
 * it burns the same battery as the scene.
 *
 * Both capture deliveries render from here — a single sprite sheet via background offsets, or one
 * image per frame via `src` swap — because `frame-strip` decides which bytes exist, not the markup.
 */
export function TurntableSprite({ manifest, alt, frames, play = false }: TurntableSpriteProps) {
  const strip = deriveFrameStrip(manifest, frames);
  const count = frameCount(strip);
  const [frame, setFrame] = useState(0);
  const [dragging, setDragging] = useState(false);

  if (!strip || count < 1) {
    return <PosterFallback manifest={manifest} alt={alt} />;
  }

  const current = clampFrame(frame, count);

  const style =
    strip.layout === 'sprite-sheet'
      ? ({ ...frameStyleAt(strip, current), touchAction: 'none' } as React.CSSProperties)
      : undefined;
  const imgSrc = strip.layout === 'frame-images' ? frameUrlAt(strip, current) : null;

  const scrub = (clientX: number, width: number) => {
    const ratio = Math.min(Math.max(clientX / Math.max(width, 1), 0), 0.999);
    setFrame(clampFrame(Math.floor(ratio * count), count));
  };

  return (
    <div
      className="nt-sprite"
      role="img"
      aria-label={`${alt} — frame ${current + 1} of ${count}${play ? ', playing' : ', drag to rotate'}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setFrame((f) => clampFrame(f + 1, count));
        if (e.key === 'ArrowLeft') setFrame((f) => clampFrame(f - 1, count));
      }}
      onPointerDown={(e) => {
        setDragging(true);
        // jsdom and older Safari lack pointer capture; scrubbing must degrade, not crash.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        scrub(e.clientX, e.currentTarget.getBoundingClientRect().width);
      }}
      onPointerMove={(e) => dragging && scrub(e.clientX, e.currentTarget.getBoundingClientRect().width)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      style={style}
    >
      {imgSrc ? <img className="nt-sprite__frame" src={imgSrc} alt={alt} decoding="async" draggable={false} /> : null}
    </div>
  );
}

/**
 * Signed URLs are short-TTL and issued by the media endpoint; the client never learns the bucket.
 * The real signer lives behind `apps/api`'s manifest route — this throws rather than pretending a
 * public URL is safe, because a geometry key in a srcset is exactly how a private bucket leaks.
 */
export function signedUrlFor(rendition: Rendition & { signedUrl?: string }): string {
  const url = trySignedUrlFor(rendition as SourcedRendition);
  if (!url) {
    throw new Error(
      `Rendition ${rendition.id} (${rendition.kind}/${rendition.lod}) has no signedUrl. ` +
        'Fetch the manifest through the media endpoint; never construct a bucket URL client-side.',
    );
  }
  return url;
}

export { TURNTABLE_FRAME_STANDARD };
