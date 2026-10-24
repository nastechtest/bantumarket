import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { budgets, type AssetManifest } from '@nastech/api-contracts';
import type { Capability } from '@nastech/ui-3d/quality';
import { LightingRig, SceneHost } from '@nastech/ui-3d/scene';
// CONTRACT-GAP: subpaths not yet re-exported from `@nastech/ui-3d` (see `ui3d-overlays.d.ts` and
// `ui3d-controls.d.ts`). This module is reached ONLY through a dynamic `import()` from the inspect
// page, so none of these bytes land in the item page's or home's chunk; when the controller adds the
// `./overlays` and `./controls` exports this file builds unchanged.
import { OverlayRoot } from '@nastech/ui-3d/overlays';
import { ControlsProvider, KEY_HELP, ViewerControls, type CameraView } from '@nastech/ui-3d/controls';
import { PilotWatchPlaceholder } from '../../scenes/PilotWatch.js';
import { SceneOverlays } from './condition-overlay.js';
import { KeyboardHelp } from './keyboard-help.js';
import { MeasurePanel } from './measure-panel.js';
import { cameraForPose, type Caliper, type Pose, type Viewport } from './scene-types.js';

/**
 * The 3D inspection subtree, split into its own lazy chunk.
 *
 * Everything that pulls the WebGL runtime — `@nastech/ui-3d/scene`, three, the DOM overlay layer, the
 * orbit controls — is reachable only from this file, and this file is reached only by
 * `import('./scene-mount.js')` inside `inspect-page.tsx`. The scene is therefore opt-in by navigation
 * to the inspect route, never by an import from the item page. `SceneHost` still re-checks capability
 * and bytes internally and routes any exit to `staticPath`; a lost GL context additionally flips
 * `onContextLost`, which unmounts this whole subtree so the DOM overlays cannot float over a poster.
 *
 * The overlay layer's camera comes from the controls' own pose state (`onPoseChange`), converted by
 * `cameraForPose` into the data-described `CaptionCamera` the pure-DOM projector expects — so the
 * callouts sit exactly where the live camera puts them, and the same pose a buyer shares restores the
 * same framing.
 */

export interface SceneMountProps {
  readonly manifest: AssetManifest;
  readonly capability: Capability;
  /** The complete static path, rendered verbatim by `SceneHost` on any scene exit (rule 1). */
  readonly staticPath: React.ReactNode;
  readonly alt: string;
  readonly pose: Pose;
  readonly onPoseChange: (pose: Pose) => void;
  readonly onContextLost: (reason: string) => void;
}

function useElementSize(ref: React.RefObject<HTMLDivElement>): Viewport {
  const [size, setSize] = useState<Viewport>({ widthPx: 320, heightPx: 240 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ widthPx: Math.max(1, box.width), heightPx: Math.max(1, box.height) });
    });
    observer.observe(el);
    const box = el.getBoundingClientRect();
    setSize({ widthPx: Math.max(1, box.width), heightPx: Math.max(1, box.height) });
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const DEFAULT_VIEW: CameraView = { azimuthDeg: 0, polarDeg: 72, zoom: 1 };

export function SceneMount({ manifest, capability, staticPath, alt, pose, onPoseChange, onContextLost }: SceneMountProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(frameRef);
  const [view, setView] = useState<CameraView>(pose ? { azimuthDeg: pose.azimuthDeg, polarDeg: pose.polarDeg, zoom: pose.zoom } : DEFAULT_VIEW);

  // The scene's own controls are authoritative once mounted; the incoming URL pose is the seed.
  useEffect(() => {
    if (pose) setView({ azimuthDeg: pose.azimuthDeg, polarDeg: pose.polarDeg, zoom: pose.zoom });
  }, [pose]);

  const handlePoseChange = useCallback(
    (_cameraPose: { id: string; label: string }, nextView: CameraView) => {
      setView(nextView);
      onPoseChange({ azimuthDeg: nextView.azimuthDeg, polarDeg: nextView.polarDeg, zoom: nextView.zoom });
    },
    [onPoseChange],
  );

  const camera = useMemo(() => cameraForPose({ azimuthDeg: view.azimuthDeg, polarDeg: view.polarDeg, zoom: view.zoom }, viewport), [view, viewport]);
  // Idle rotation is a scene-only nicety; a coarse-pointer or reduced-motion device does not get a
  // loop it did not ask for (and never gets here — those cases took the static path upstream).
  const spin = !capability.coarsePointer && !capability.prefersReducedMotion;
  const calipers: readonly Caliper[] = [];

  return (
    <ControlsProvider captions={manifest.captions} claimScope={manifest.claimScope} sceneLabel={alt} onPoseChange={handlePoseChange}>
      <div className="nt-inspect-scene">
        <div ref={frameRef} className="nt-inspect-scene__stage" style={{ position: 'relative' }}>
          <SceneHost
            manifest={manifest}
            capability={capability}
            staticPath={staticPath}
            ariaLabel={`3D model of ${alt}`}
            budgetBytes={SCENE_BYTE_CEILING}
            onContextLost={(info) => onContextLost(info.reason)}
          >
            <LightingRig />
            <PilotWatchPlaceholder spin={spin} />
            <ViewerControls sceneLabel={alt} claimScope={manifest.claimScope} />
          </SceneHost>

          <SceneOverlays
            Root={OverlayRoot}
            manifest={manifest}
            camera={camera}
            viewport={viewport}
            calipers={calipers}
          />
        </div>

        {/* Honest, non-closable label: this geometry is a stand-in, never the item. */}
        <p className="nt-inspect-scene__caption" role="note">
          Placeholder geometry — proves the capture pipeline; not the item you are buying. The photographs and written notes are the record.
        </p>

        <MeasurePanel metersPerUnit={manifest.metricScaleMetersPerUnit} calipers={calipers} />
        <KeyboardHelp entries={KEY_HELP} />
        <p className="nt-inspect-scene__share">
          <a
            href={`${window.location.pathname}#pose=${view.azimuthDeg.toFixed(0)},${view.polarDeg.toFixed(0)},${view.zoom.toFixed(2)}`}
          >
            Share this view
          </a>
        </p>
      </div>
    </ControlsProvider>
  );
}

/** The byte ceiling the host reads if a caller wants to override `budgets.sceneLodMaxBytes`. */
export const SCENE_BYTE_CEILING = budgets.sceneLodMaxBytes;
