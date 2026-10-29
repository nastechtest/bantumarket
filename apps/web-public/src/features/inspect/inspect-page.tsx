import { Suspense, lazy, useMemo } from 'react';
import type { RouteDef } from '../../router.js';
import { fixtureManifest } from '../../lib/fixtures.js';
import { useInspect, sceneShouldMount } from './use-inspect.js';
import { InspectStatic } from './inspect-error.js';
import { StaticPath } from './static-path.js';
import { QualityReadout } from './quality-readout.js';
import { CaptureMetadata } from './capture-metadata.js';

/**
 * The 3D inspection surface — the `scene` route class.
 *
 * Reaches the WebGL runtime ONLY through `import('./scene-mount.js')` (the dynamic `lazy` below). This
 * file, and everything it imports statically, is scene-free: the capability probe, byte gate and
 * decision live in `@nastech/ui-3d/quality` (a static edge), and the complete static path lives in
 * `@nastech/ui-3d/fallback` (also static). So a buyer who never opts into the render, or whose device
 * or connection or motion preference routes them to the static path, never downloads a byte of the
 * scene — and the fence in `scripts/check-3d-boundaries.ts` can prove the item page reaches here only
 * by navigation.
 */

// CONTRACT-GAP note lives with the scene subtree. This boundary is what keeps three out of this chunk.
// scene-mount exports by name and `lazy` wants a default; the adapter stays here so the scene file keeps one export surface.
const SceneMount = lazy(() => import('./scene-mount.js').then((m) => ({ default: m.SceneMount })));

function listingIdFrom(pathname: string): string {
  const m = /^\/item\/([^/]+)\/inspect\/?$/.exec(pathname);
  return m?.[1] ?? fixtureManifest.listingId;
}

export function InspectPage({ route }: { route: RouteDef }) {
  const manifest = fixtureManifest;
  const itemId = typeof window === 'undefined' ? manifest.listingId : listingIdFrom(window.location.pathname);
  const alt = `Pre-owned watch ${itemId}`;

  const { capability, plan, pose, setPose, gaveUp, reportSceneFailure } = useInspect(manifest);
  const mountScene = useMemo(() => sceneShouldMount(plan, gaveUp), [plan, gaveUp]);

  // The full static path is both the non-scene landing and the `SceneHost` exit prop — one source.
  const staticPath = (
    <StaticPath
      manifest={manifest}
      alt={alt}
      note="Photographs and written condition notes — the same record the 3D view points at."
    />
  );

  return (
    <section className="nt-inspect" data-route-class={route.class}>
      <header className="nt-inspect__header">
        <h1>Inspect — {itemId}</h1>
        <QualityReadout plan={plan} />
      </header>

      {mountScene ? (
        <Suspense fallback={staticPath}>
          <SceneMount
            manifest={manifest}
            /* The pilot fixture listing is the watch the placeholder always depicted, so naming the
               model here is a statement of fact about this item. When manifests carry a category the
               explicit prop goes away and `modelForAsset` decides. */
            model="wristwatch"
            capability={capability}
            staticPath={staticPath}
            alt={alt}
            pose={pose}
            onPoseChange={setPose}
            onContextLost={reportSceneFailure}
          />
        </Suspense>
      ) : (
        <InspectStatic manifest={manifest} alt={alt} plan={plan} />
      )}

      <CaptureMetadata manifest={manifest} isPlaceholder />
    </section>
  );
}

export default function Page({ route }: { route: RouteDef }) {
  return <InspectPage route={route} />;
}
