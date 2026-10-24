import { useMemo } from 'react';
import * as THREE from 'three';
import { steel } from './materials.js';

/**
 * Bracelet clasp. A deployant clasp is where wear actually shows on a pre-owned watch, and it is a
 * named posture in the tokens (`clasp`) — so the placeholder carries one to prove the pose navigation
 * reaches a real surface. It is a hinge + two links, not a full bracelet; the caption beside the
 * render is explicit that this geometry is a stand-in, not the item.
 */

export function Clasp() {
  const plate = useMemo(() => new THREE.BoxGeometry(0.014, 0.0018, 0.011), []);
  const hinge = useMemo(() => new THREE.CylinderGeometry(0.0016, 0.0016, 0.013, 24, 1), []);
  const steelProps = steel();

  return (
    <group name="placeholder-clasp" position={[0, -0.001, 0.0285]} rotation={[0.2, 0, 0]}>
      <mesh geometry={plate} position={[-0.0075, 0, 0]}>
        <meshPhysicalMaterial {...steelProps} />
      </mesh>
      <mesh geometry={plate} position={[0.0075, 0.0004, 0]}>
        <meshPhysicalMaterial {...steelProps} />
      </mesh>
      <mesh geometry={hinge} position={[0, 0.0008, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshPhysicalMaterial {...steelProps} roughness={0.34} />
      </mesh>
    </group>
  );
}
