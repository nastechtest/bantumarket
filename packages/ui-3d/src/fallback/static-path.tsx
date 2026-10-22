import { useState } from 'react';
import type { AssetManifest, Rendition } from '@nastech/api-contracts';

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
  if (failed) {
    return (
      <div className="nt-poster nt-poster--missing" role="img" aria-label={`${alt} (image unavailable)`}>
        <span>{children ?? null}</span>
      </div>
    );
  }
  return (
    <img
      className="nt-poster"
      src={signedUrlFor(manifest.poster)}
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
 * Sprite-sheet turntable. Dragging scrubs frames; releasing returns to the current frame rather
 * than auto-playing, because an unattended loop on a listing grid is motion the buyer did not ask
 * for and it burns the same battery as the scene.
 */
export function TurntableSprite({ manifest, alt, frames, play = false }: TurntableSpriteProps) {
  const sprite = manifest.sprite;
  const count = frames ?? sprite?.frames ?? 12;
  const [frame, setFrame] = useState(0);
  const [dragging, setDragging] = useState(false);

  if (!sprite) {
    return <PosterFallback manifest={manifest} alt={alt} />;
  }

  const offset = -(frame / count) * 100;
  const scrub = (clientX: number, width: number) => {
    const ratio = Math.min(Math.max(clientX / Math.max(width, 1), 0), 0.999);
    setFrame(Math.floor(ratio * count));
  };

  return (
    <div
      className="nt-sprite"
      role="img"
      aria-label={`${alt} — ${count} frame turntable${play ? ', playing' : ', drag to rotate'}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setFrame((f) => (f + 1) % count);
        if (e.key === 'ArrowLeft') setFrame((f) => (f - 1 + count) % count);
      }}
      onPointerDown={(e) => {
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        scrub(e.clientX, e.currentTarget.getBoundingClientRect().width);
      }}
      onPointerMove={(e) => dragging && scrub(e.clientX, e.currentTarget.getBoundingClientRect().width)}
      onPointerUp={() => setDragging(false)}
      style={{
        backgroundImage: `url(${signedUrlFor(sprite)})`,
        backgroundSize: `${count * 100}% 100%`,
        backgroundPosition: `${offset}% 0%`,
      }}
    />
  );
}

/**
 * Signed URLs are short-TTL and issued by the media endpoint; the client never learns the bucket.
 * The real signer lives behind `apps/api`'s manifest route — this throws rather than pretending a
 * public URL is safe, because a geometry key in a srcset is exactly how a private bucket leaks.
 */
export function signedUrlFor(rendition: Rendition & { signedUrl?: string }): string {
  const url = (rendition as { signedUrl?: string }).signedUrl;
  if (!url) {
    throw new Error(
      `Rendition ${rendition.id} (${rendition.kind}/${rendition.lod}) has no signedUrl. ` +
        'Fetch the manifest through the media endpoint; never construct a bucket URL client-side.',
    );
  }
  return url;
}
