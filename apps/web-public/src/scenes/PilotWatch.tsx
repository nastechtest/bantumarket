import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { lightingTokens, materialTokens, sceneTokens } from '@nastech/ui-3d/tokens';

/**
 * Geometry placeholder for the pilot category until the first capture session publishes a GLB.
 * It exists to prove the scene pipeline (materials, rig, DPR cap, disposal) end to end, and is
 * deleted the day a real model ships. It must never be presented to a buyer as the item.
 */
export function PilotWatchPlaceholder({ spin = true }: { spin?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const caseGeo = useMemo(() => new THREE.CylinderGeometry(0.0202, 0.0202, 0.0092, 96, 1), []);
  const crystalGeo = useMemo(() => new THREE.CylinderGeometry(0.0178, 0.0178, 0.0012, 96, 1), []);
  const crownGeo = useMemo(() => new THREE.CylinderGeometry(0.0022, 0.0022, 0.0034, 32, 1), []);

  useFrame((_, delta) => {
    if (spin && group.current) group.current.rotation.y += delta * 0.35;
  });

  return (
    <group ref={group} position={[0, sceneTokens.pivot.y, 0]} rotation={[Math.PI / 2.6, 0, 0]}>
      <ambientLight intensity={lightingTokens.fillIntensity} color={lightingTokens.fillColor} />
      <directionalLight position={lightingTokens.keyPosition} intensity={lightingTokens.keyIntensity} color={lightingTokens.keyColor} />
      <mesh geometry={caseGeo}>
        <meshPhysicalMaterial color="#C9CDD2" metalness={materialTokens.metalness.steel} roughness={materialTokens.roughness.steel} clearcoat={materialTokens.clearcoat.polishedCase} />
      </mesh>
      <mesh geometry={crystalGeo} position={[0, 0.005, 0]}>
        <meshPhysicalMaterial color="#F4F7FA" metalness={0} roughness={materialTokens.roughness.crystal} clearcoat={materialTokens.clearcoat.crystal} transmission={0.65} thickness={0.001} />
      </mesh>
      <mesh geometry={crownGeo} position={[0.0215, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <meshPhysicalMaterial color="#B7BCC2" metalness={materialTokens.metalness.steel} roughness={0.34} />
      </mesh>
    </group>
  );
}
