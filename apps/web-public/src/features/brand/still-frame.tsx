import type { AssetManifest } from '@nastech/api-contracts';
import { PosterFallback } from '@nastech/ui-3d/fallback';

/**
 * Brand surface 3 — a still frame.
 *
 * One captured angle, rendered as a plain image with a caption, no scrubber and no motion. This is the
 * atom the category showcase is built from: a grid of stills is an honest browse surface that needs no
 * WebGL and no interaction to be useful, and it is the same delivery path (signed poster bytes) the
 * static inspect route uses. It never presents itself as anything other than a photograph of the item.
 */

export interface StillFrameProps {
  readonly manifest: AssetManifest;
  readonly alt: string;
  readonly caption: string;
  readonly href: string;
}

export function StillFrame({ manifest, alt, caption, href }: StillFrameProps) {
  return (
    <a className="nt-still-frame" href={href}>
      <PosterFallback manifest={manifest} alt={alt} />
      <span className="nt-still-frame__caption">{caption}</span>
    </a>
  );
}
