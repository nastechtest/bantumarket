import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sceneTokens } from '@nastech/ui-3d/tokens';
import { WatchCase } from './watch-case.js';
import { Crystal } from './crystal.js';
import { CrownAndLugs } from './crown-and-lugs.js';
import { Clasp } from './clasp.js';

/**
 * The pilot-category placeholder, assembled from authored primitives.
 *
 * This is NOT the item and must never be presented as it. It exists only to prove the capture-to-
 * render pipeline — materials from the tokens, the studio rig, the DPR cap, disposal, the metric
 * alignment — end to end, and the first real capture deletes this file. The surfaces around it
 * (the DOM caption in `scene-mount.tsx`, the `isPlaceholder` line in `capture-metadata.tsx`, and the
 * `CLAIM_SCOPE_DISCLOSURE` banner that rides on the scene) are what keep that promise; the geometry
 * name and this comment are what keep it true in code.
 *
 * `spin` is a slow idle rotation; the caller passes `false` under reduced motion or a static-tier
 * device, and the surrounding UI never lets a still geometry claim it was "inspected".
 */

export interface PilotWatchPlaceholderProps {
  readonly spin?: boolean;
}

export function PilotWatchPlaceholder({ spin = true }: PilotWatchPlaceholderProps) {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (spin && group.current) group.current.rotation.y += delta * 0.35;
  });

  return (
    <group
      ref={group}
      name="pilot-watch-placeholder"
      // Lift onto the pivot the loader centres geometry on, and tilt the dial toward the camera so
      // the first frame reads as "face-up on the turntable" rather than floating on its edge.
      position={[0, sceneTokens.pivot.y, 0]}
      rotation={[Math.PI / 2.6, 0, 0]}
    >
      <WatchCase />
      <Crystal />
      <CrownAndLugs />
      <Clasp />
    </group>
  );
}
