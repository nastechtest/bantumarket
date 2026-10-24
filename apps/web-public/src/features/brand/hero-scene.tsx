import { useEffect, useState } from 'react';
import type { AssetManifest } from '@nastech/api-contracts';
import type { Capability } from '@nastech/ui-3d/quality';
import type { CanvasHost as CanvasHostType } from '@nastech/ui-3d/scene';
import type { PilotWatchPlaceholder as PlaceholderType } from '../../scenes/PilotWatch.js';

/**
 * Brand hero scene — opt-in, and lazy by construction.
 *
 * Nothing here imports the WebGL runtime at module load: `CanvasHost` and the placeholder geometry are
 * pulled with a dynamic `import()` only after the buyer taps to view the item in 3D. That is what keeps
 * the Home route under its brand budget (≤220 KB): the scene chunk is fetched on tap, never on paint,
 * so a buyer who reads the poster never pays for three. The poster underneath stays put — the scene
 * layers over it, and a lost context removes the scene and leaves the photograph (rule 1).
 *
 * No glass, no gradient, no cursor-follow, no cinematic transition: it is the same geometry as the
 * inspect surface, presented flat and labelled as the placeholder it is.
 */

export interface HeroSceneProps {
  readonly manifest: AssetManifest;
  readonly alt: string;
  readonly capability: Capability;
  /** The buyer tapped "View in 3D". Until this is true, no scene byte is requested. */
  readonly requested: boolean;
  readonly onContextLost?: () => void;
}

type LoadedScene = { readonly CanvasHost: typeof CanvasHostType; readonly Placeholder: typeof PlaceholderType };

export function HeroScene({ manifest, alt, capability, requested, onContextLost }: HeroSceneProps) {
  const [scene, setScene] = useState<LoadedScene | null>(null);

  useEffect(() => {
    if (!requested || scene) return;
    let cancelled = false;
    // Dynamic import is the whole point: these modules — and three behind them — are not in Home's chunk.
    Promise.all([import('@nastech/ui-3d/scene'), import('../../scenes/PilotWatch.js')])
      .then(([s, w]) => {
        if (!cancelled) setScene({ CanvasHost: s.CanvasHost, Placeholder: w.PilotWatchPlaceholder });
      })
      .catch(() => onContextLost?.());
    return () => {
      cancelled = true;
    };
  }, [requested, scene, onContextLost]);

  if (!requested) {
    return (
      <p className="nt-hero__scene-off" role="note">
        Showing the photograph. 3D is fetched only when you ask for it.
      </p>
    );
  }

  if (!scene) {
    return (
      <p className="nt-hero__scene-loading" role="status">
        Preparing the 3D view…
      </p>
    );
  }

  const { CanvasHost, Placeholder } = scene;
  const spin = !capability.prefersReducedMotion && !capability.coarsePointer;
  return (
    <div className="nt-hero__scene" style={{ position: 'absolute', inset: 0 }}>
      <CanvasHost
        ariaLabel={`Interactive model of ${alt}`}
        dprCap={2}
        onContextLost={() => onContextLost?.()}
      >
        <Placeholder spin={spin} />
      </CanvasHost>
      <p className="nt-hero__scene-caption">Placeholder geometry — proves the pipeline, not the item.</p>
    </div>
  );
}
