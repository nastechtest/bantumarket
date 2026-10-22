import * as THREE from 'three';
import { sceneTokens } from '@nastech/ui-3d/tokens';

/**
 * Scene graph normalisation (07 §4.1 `viewer/`).
 *
 * The capture pipeline records `metricScaleMetersPerUnit`: how many metres one model unit spans.
 * Applying it as a scale factor puts the model in a world where 1 unit = 1 metre, and the camera
 * (positioned in metres) then shows the watch at the size it really is. Skip this step and a
 * 40 mm case renders 4 cm next to a hand — the size claim on the listing becomes a lie told by a
 * transform, so getting this right is a truthfulness requirement, not a nicety.
 */

export interface MetricNormalization {
  /** Scale factor applied to the root. */
  readonly scale: number;
  /** World-space centre after normalisation — equals the pivot unless the box was empty. */
  readonly center: { readonly x: number; readonly y: number; readonly z: number };
  /** Size of the model in metres, post-normalisation. The number the size claim reads. */
  readonly sizeMeters: { readonly x: number; readonly y: number; readonly z: number };
}

export function normalizeToMetric(
  root: THREE.Object3D,
  metersPerUnit: number,
  pivot: { x: number; y: number; z: number } = sceneTokens.pivot,
): MetricNormalization {
  if (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0) {
    throw new TypeError(
      `scene-graph: metricScaleMetersPerUnit must be a positive finite number, got ${metersPerUnit}. ` +
        'A model rendered without a valid metric scale cannot support its size claim.',
    );
  }

  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) {
    throw new TypeError('scene-graph: cannot normalise a model with an empty bounding box.');
  }

  // World size in metres is (unit size) × (metres per unit); making 1 unit = 1 metre means
  // scaling the root by exactly metersPerUnit whatever its pre-existing scale.
  root.scale.multiplyScalar(metersPerUnit);
  root.updateWorldMatrix(true, true);

  const scaled = new THREE.Box3().setFromObject(root);
  const size = scaled.getSize(new THREE.Vector3());
  const center = scaled.getCenter(new THREE.Vector3());
  root.position.x += pivot.x - center.x;
  root.position.y += pivot.y - center.y;
  root.position.z += pivot.z - center.z;
  root.updateWorldMatrix(true, true);

  return {
    scale: metersPerUnit,
    center: { x: pivot.x, y: pivot.y, z: pivot.z },
    sizeMeters: { x: size.x, y: size.y, z: size.z },
  };
}

/**
 * Distance at which a camera with `fovDeg` sees `sizeMeters` fill `frameFill` of the frame.
 * Derived from the same tokens the app renders with, so the framing promise and the geometry
 * math cannot drift apart.
 */
export function fitCameraDistance(
  sizeMeters: number,
  fovDeg: number = sceneTokens.cameraFovDeg,
  frameFill: number = sceneTokens.frameFill,
): number {
  if (!(sizeMeters > 0)) throw new TypeError(`fitCameraDistance: size must be positive, got ${sizeMeters}`);
  const halfFov = (fovDeg * Math.PI) / 360;
  const visibleHeightAtDistance = 2 * Math.tan(halfFov);
  return sizeMeters / (frameFill * visibleHeightAtDistance);
}
