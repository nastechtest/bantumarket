import { useMemo } from 'react';
import * as THREE from 'three';
import { steel } from './materials.js';

/**
 * Crown (at 3 o'clock) and the four lugs. These are the small geometry the posture tokens frame —
 * crown, 3 o'clock, 6 o'clock — so the placeholder needs them present for the named-pose wiring to
 * point at anything. Lugs are boxes rather than a sculpted bracelet: enough silhouette to orbit, not
 * a promise of a link pattern the capture never resolved.
 */

export function CrownAndLugs() {
  const crown = useMemo(() => new THREE.CylinderGeometry(0.0022, 0.0022, 0.0034, 32, 1), []);
  const stem = useMemo(() => new THREE.BoxGeometry(0.0022, 0.0022, 0.0022), []);
  const lug = useMemo(() => new THREE.BoxGeometry(0.006, 0.004, 0.011), []);
  const steelProps = steel();

  return (
    <group name="placeholder-crown-lugs">
      <mesh geometry={stem} position={[0.0212, 0, 0]}>
        <meshPhysicalMaterial {...steelProps} />
      </mesh>
      <mesh geometry={crown} position={[0.0232, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshPhysicalMaterial {...steelProps} roughness={0.34} />
      </mesh>
      {([[0.013, 0.0145], [-0.013, 0.0145], [0.013, -0.0145], [-0.013, -0.0145]] as const).map(([x, z], i) => (
        <mesh key={i} geometry={lug} position={[x, -0.0008, z]}>
          <meshPhysicalMaterial {...steelProps} />
        </mesh>
      ))}
    </group>
  );
}
