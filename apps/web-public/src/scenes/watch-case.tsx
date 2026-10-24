import { useMemo } from 'react';
import * as THREE from 'three';
import { steel } from './materials.js';

/**
 * The case middle and bezel — the pilot watch's main body, authored from primitives, in metres.
 *
 * This is a placeholder for the capture pipeline, not a product render: it exists so the loader, the
 * studio rig, the DPR cap and disposal can be exercised end-to-end before the first real GLB ships.
 * It is dimensioned to the same 40.5 mm case the fixture manifest aligns to so the metric plumbing
 * (ScaleBar, calipers) has something the right size to sit against.
 */

export function WatchCase() {
  const body = useMemo(() => new THREE.CylinderGeometry(0.0202, 0.0202, 0.0092, 96, 1), []);
  const bezel = useMemo(() => new THREE.TorusGeometry(0.0202, 0.0016, 20, 96), []);
  const back = useMemo(() => new THREE.CylinderGeometry(0.0196, 0.0196, 0.0008, 96, 1), []);
  const steelProps = steel();

  return (
    <group name="placeholder-case">
      <mesh geometry={body}>
        <meshPhysicalMaterial {...steelProps} />
      </mesh>
      <mesh geometry={bezel} position={[0, 0.0046, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshPhysicalMaterial {...steelProps} roughness={0.18} />
      </mesh>
      <mesh geometry={back} position={[0, -0.0048, 0]}>
        <meshPhysicalMaterial {...steelProps} />
      </mesh>
    </group>
  );
}
