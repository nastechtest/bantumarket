import { useCallback, useMemo, useState } from 'react';
import { probeCapability, UNSUPPORTED, type Capability } from '@nastech/ui-3d/quality';
import type { AssetManifest } from '@nastech/api-contracts';
import { decideInspect, type InspectPlan } from './inspect-decision.js';
import { decodePose } from './share-pose.js';
import type { Pose } from './scene-types.js';

/**
 * The inspect surface's state, and nothing else.
 *
 * Capability is probed exactly once (it is a synchronous GPU query; repeating it per render is how a
 * jank budget dies), the scene-or-static plan is derived from that probe + the manifest in one memo,
 * and the pose is seeded from the URL fragment so a shared view restores. A context loss or a scene
 * build failure flips `gaveUp`, which routes the page to the complete static path — the same landing
 * spot every other scene exit uses.
 *
 * `capability` is injectable so the static branches (reduced motion, save-data, no WebGL) are
 * testable without a browser and without a fake GPU.
 */

export const DEFAULT_POSE: Pose = { azimuthDeg: 0, polarDeg: 72, zoom: 1 };

export interface UseInspect {
  readonly capability: Capability;
  readonly plan: InspectPlan;
  readonly pose: Pose;
  readonly setPose: (pose: Pose) => void;
  readonly gaveUp: boolean;
  readonly reportSceneFailure: (reason: string) => void;
}

export function useInspect(manifest: AssetManifest, capability?: Capability): UseInspect {
  const [cap] = useState<Capability>(() =>
    capability ?? (typeof window === 'undefined' ? UNSUPPORTED : probeCapability()),
  );

  const plan = useMemo<InspectPlan>(() => decideInspect(cap, manifest), [cap, manifest]);

  const [pose, setPoseState] = useState<Pose>(() =>
    typeof window === 'undefined' ? DEFAULT_POSE : decodePose(window.location.hash, DEFAULT_POSE),
  );
  const setPose = useCallback((next: Pose) => setPoseState(next), []);

  const [gaveUp, setGaveUp] = useState(false);
  const reportSceneFailure = useCallback((reason: string) => {
    // Reason is intentionally swallowed into the boolean: the static path states it, and a lost
    // context is terminal for the session (canvas-host.tsx), so there is no retry to route it to.
    void reason;
    setGaveUp(true);
  }, []);

  return { capability: cap, plan, pose, setPose, gaveUp, reportSceneFailure };
}

/** Whether the inspect route should even fetch the scene chunk (navigation is the opt-in). */
export function sceneShouldMount(plan: InspectPlan, gaveUp: boolean): boolean {
  return plan.mode === 'scene' && !gaveUp;
}
