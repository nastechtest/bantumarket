import { useState, type ReactNode } from 'react';
import type { AssetManifest, ConditionCaption } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import { ConditionCallout, hasDisclosureRef } from './condition-callout.js';
import { placeHotspot, type ConvexBounds } from './annotation-hotspot.js';
import { ClaimScopeBanner } from './claim-scope-banner.js';
import { Legend } from './legend.js';
import { ScaleBar } from './scale-bar.js';
import { MeasurementOverlay, type Caliper } from './measurement-overlay.js';
import type { CaptionCamera, Viewport } from './caption-projector.js';

/**
 * DOM overlay root (brief 03, module 7).
 *
 * Layered over the canvas in the DOM — never drei `Html` — so caption text is selectable,
 * findable, and read by assistive tech, and so the overlay survives a lost GL context (rule 1:
 * the disclosures are the evidence path, the scene is the view).
 *
 * Pointer-events are carved: the container is `none` so orbit drags pass straight through to the
 * canvas everywhere except the markers themselves, which opt back in with `auto`. A buyer can
 * grab the scene between hotspots without ever hitting an invisible hit-box.
 */

export interface OverlayRootProps {
  readonly captions: readonly ConditionCaption[];
  readonly claimScope: AssetManifest['claimScope'];
  /** Passed through as-is; an invalid or absent alignment must remove measurements, not fake them. */
  readonly metersPerUnit: number | null | undefined;
  readonly camera: CaptionCamera;
  readonly viewport: Viewport;
  readonly bounds: ConvexBounds;
  readonly calipers?: readonly Caliper[];
  readonly children?: ReactNode;
}

export function OverlayRoot({ captions, claimScope, metersPerUnit, camera, viewport, bounds, calipers, children }: OverlayRootProps) {
  const [openHotspot, setOpenHotspot] = useState<string | null>(null);

  const visible = captions
    .filter(hasDisclosureRef)
    .map((caption) => ({ caption, placement: placeHotspot(caption, camera, viewport, bounds) }))
    .filter((marker) => !marker.placement.occluded);

  return (
    <div
      className="nt-overlay-root"
      role="group"
      aria-label="Condition overlays for the 3D view"
      style={{ position: 'absolute', inset: 0, width: viewport.widthPx, height: viewport.heightPx, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <div style={{ position: 'absolute', top: raw.space.s3, left: raw.space.s3 }}>
        <ClaimScopeBanner claimScope={claimScope} />
      </div>
      <div style={{ position: 'absolute', top: raw.space.s3, right: raw.space.s3 }}>
        <Legend
          claimScope={claimScope}
          captions={captions}
          metersPerUnit={metersPerUnit}
          showCalipers={Boolean(calipers && calipers.length > 0)}
        />
      </div>
      <div style={{ position: 'absolute', bottom: raw.space.s4, left: raw.space.s3 }}>
        <ScaleBar metersPerUnit={metersPerUnit} camera={camera} viewport={viewport} />
      </div>
      {calipers && calipers.length > 0 ? (
        <MeasurementOverlay calipers={calipers} metersPerUnit={metersPerUnit} camera={camera} viewport={viewport} />
      ) : null}
      {visible.map(({ caption, placement }) => (
        <ConditionCallout
          key={caption.hotspotId}
          caption={caption}
          projection={placement.projection}
          claimScope={claimScope}
          open={openHotspot === caption.hotspotId}
          onToggle={() => setOpenHotspot((current) => (current === caption.hotspotId ? null : caption.hotspotId))}
        />
      ))}
      {children}
    </div>
  );
}

/** Convenience for the app layer: is there anything at all to show for this manifest? */
export function hasVisibleOverlays(manifest: Pick<AssetManifest, 'captions'>): boolean {
  return manifest.captions.some(hasDisclosureRef);
}
