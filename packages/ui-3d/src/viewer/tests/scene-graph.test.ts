import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { sceneTokens } from '@nastech/ui-3d/tokens';
import { fitCameraDistance, normalizeToMetric } from '../scene-graph.js';

/** A watch case: ~2 units wide in export scale, 0.02 m per unit → a 40 mm case. */
function watchModel(offsetX = 0): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 2));
  mesh.position.set(offsetX, 0, 0);
  root.add(mesh);
  return root;
}

describe('scene-graph metric normalisation', () => {
  test('after normalisation the box spans its REAL metres, not export units', () => {
    const root = watchModel();
    const result = normalizeToMetric(root, 0.02);
    expect(result.sizeMeters.x).toBeCloseTo(0.04, 6);
    expect(result.sizeMeters.y).toBeCloseTo(0.012, 6);
    // And the claim survives measurement from the scene graph itself:
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.04, 6); // 1 unit = 1 metre: a 40 mm case reads 40 mm
  });

  test('the model is centred on the pivot, whatever offset the export left it at', () => {
    const root = watchModel(5); // export translated the case 5 units along x
    normalizeToMetric(root, 0.02, sceneTokens.pivot);
    root.updateWorldMatrix(true, true);
    const center = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(sceneTokens.pivot.x, 6);
    expect(center.y).toBeCloseTo(sceneTokens.pivot.y, 6);
    expect(center.z).toBeCloseTo(sceneTokens.pivot.z, 6);
  });

  test('a pre-scaled root (exporter already baked a scale) still ends in metres', () => {
    const root = watchModel();
    root.scale.setScalar(0.5); // exporter half-scale
    normalizeToMetric(root, 0.02);
    root.updateWorldMatrix(true, true);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2 * 0.5 * 0.02, 6);
  });

  test('a nonsense metric scale throws instead of silently rendering a wrong size claim', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => normalizeToMetric(watchModel(), bad)).toThrow(TypeError);
    }
  });

  test('an empty model throws: there is nothing to size-claim', () => {
    expect(() => normalizeToMetric(new THREE.Group(), 0.02)).toThrow(TypeError);
  });

  test('fitCameraDistance grows with the object and shrinks with the frame fill', () => {
    const near = fitCameraDistance(0.04);
    const far = fitCameraDistance(0.4);
    expect(far).toBeGreaterThan(near);
    expect(far / near).toBeCloseTo(10, 5);
    const fillTighter = fitCameraDistance(0.04, sceneTokens.cameraFovDeg, 0.9);
    expect(fillTighter).toBeLessThan(near); // object must fill MORE of the frame → camera closer
  });
});
