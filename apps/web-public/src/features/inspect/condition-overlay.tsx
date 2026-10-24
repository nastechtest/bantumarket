import type { ReactNode } from 'react';
import type { AssetManifest, ConditionCaption } from '@nastech/api-contracts';
// Type-only: the fence erases `import type`, so this costs no runtime edge and the module loads
// without the (not-yet-exported) overlays subpath resolving. The real OverlayRoot is *injected* below.
import type { OverlayRootProps } from '@nastech/ui-3d/overlays';
import type { Caliper, CaptionCamera, ConvexBounds, Viewport } from './scene-types.js';

/**
 * Wiring between the manifest and the ui-3d overlay layer.
 *
 * `OverlayRoot` (from `@nastech/ui-3d/overlays`) is passed in as `Root` rather than imported at
 * runtime, because the overlays subpath is a CONTRACT-GAP today (see `ui3d-overlays.d.ts`) and lives
 * in the lazy scene chunk. Keeping the component injected means this wiring is unit-testable with a
 * fake, while `scene-mount` hands it the real one — and the guarantee the brief names ("every callout
 * binds to a disclosureId") is enforced at *our* boundary: we never render the overlay layer for an
 * item with no disclosure-bound caption, and we forward the manifest's real captions, not copies.
 */

/** A caption is a callout only if it names the disclosure record the dispute reads. Whitespace = none. */
export function disclosureBound(caption: Pick<ConditionCaption, 'disclosureId'>): boolean {
  return typeof caption.disclosureId === 'string' && caption.disclosureId.trim().length > 0;
}

/**
 * A convex bounding sphere for the facing test, sized from the capture's metric alignment rather than
 * guessed: the pilot case diameter is `metricScaleMetersPerUnit` (0.0405 m), so the enclosing sphere
 * radius in unit space (metres) is a hair over half that. An invalid/absent scale yields a tiny
 * radius, which simply marks edge hotspots as facing-away rather than inventing a hull.
 */
export function overlayBounds(manifest: AssetManifest): ConvexBounds {
  const diameter = manifest.metricScaleMetersPerUnit;
  const radiusUnits = Number.isFinite(diameter) && diameter > 0 ? diameter * 0.55 : 0.001;
  return { center: [0, 0, 0], radiusUnits };
}

export type OverlayRootComponent = (props: OverlayRootProps) => ReactNode;

export interface SceneOverlaysProps {
  readonly Root: OverlayRootComponent;
  readonly manifest: AssetManifest;
  readonly camera: CaptionCamera;
  readonly viewport: Viewport;
  readonly calipers?: readonly Caliper[];
}

export function SceneOverlays({ Root, manifest, camera, viewport, calipers }: SceneOverlaysProps) {
  const boundCaptions = manifest.captions.filter(disclosureBound);
  // No disclosure-bound caption ⇒ nothing to point at ⇒ render no overlay layer at all, rather than an
  // empty overlay root that still paints the claim banner over a scene with no condition content.
  if (boundCaptions.length === 0) return null;

  return (
    <Root
      captions={boundCaptions}
      claimScope={manifest.claimScope}
      metersPerUnit={manifest.metricScaleMetersPerUnit}
      camera={camera}
      viewport={viewport}
      bounds={overlayBounds(manifest)}
      {...(calipers && calipers.length > 0 ? { calipers } : {})}
    />
  );
}
