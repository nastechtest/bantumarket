import { useMemo } from 'react';
import * as THREE from 'three';
import { crystal as crystalMaterial, leather } from './materials.js';

/**
 * Crystal and dial face. The crystal is the only transmissive material in the catalogue (brief-05),
 * and the dial is a plain dark disc — deliberately *not* a printed logo or a legible index, because a
 * placeholder that reads like a real face invites a buyer to "inspect" detail the capture never made.
 * Two hands give the geometry a silhouette to orbit without implying a running movement.
 */

export function Crystal() {
  const dome = useMemo(() => {
    // A shallow spherical cap: sphere scaled flat in Y, sitting proud of the bezel.
    const geo = new THREE.SphereGeometry(0.0184, 48, 24, 0, Math.PI * 2, 0, Math.PI / 5);
    geo.scale(1, 0.32, 1);
    return geo;
  }, []);
  const dial = useMemo(() => new THREE.CircleGeometry(0.018, 64), []);
  const hand = useMemo(() => new THREE.BoxGeometry(0.0009, 0.012, 0.0004), []);
  const crystalProps = crystalMaterial();
  const dialProps = leather();

  return (
    <group name="placeholder-crystal" position={[0, 0.0052, 0]}>
      <mesh geometry={dial} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0006, 0]}>
        <meshPhysicalMaterial {...dialProps} />
      </mesh>
      <mesh geometry={hand} position={[0.004, 0.0, 0]} rotation={[0, 0, -0.6]}>
        <meshPhysicalMaterial color="#EDEDEE" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh geometry={hand} position={[0, 0.0, -0.004]} rotation={[0, 0, 0]}>
        <meshPhysicalMaterial color="#EDEDEE" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh geometry={dome} position={[0, 0.0002, 0]}>
        <meshPhysicalMaterial {...crystalProps} />
      </mesh>
    </group>
  );
}
