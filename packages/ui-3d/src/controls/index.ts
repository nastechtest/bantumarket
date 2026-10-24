/**
 * Public surface of the camera/input layer. The inspect route reaches this only through a dynamic
 * import, so these bytes live in the scene chunk; the fence classifies `@nastech/ui-3d/controls`
 * as a scene edge for exactly that reason.
 *
 * The pure geometry helpers are exported because the capture station and the QC console reason
 * about the same limits as the buyer's viewer. Anything that touches React state stays behind the
 * two components.
 */

export {
  ControlsProvider,
  ViewerControls,
  type ControlsProviderProps,
  type ViewerControlsProps,
} from './controls-provider.js';
export {
  KEY_HELP,
  canonicalStops,
  intentForKey,
  type CameraIntent,
  type CameraPose,
} from './keyboard-rotate.js';
export { type CameraView, type InputSource } from './gesture-state.js';
export {
  CASE_BACK_POLAR_DEG,
  CRYSTAL_TOP_POLAR_DEG,
  DEFAULT_ZOOM_RANGE,
  ORBIT_DEG_PER_PIXEL,
  POLAR_SINGULARITY_MARGIN_DEG,
  SAFE_DEFAULT_GEOMETRY,
  CaptureGeometryError,
  applyOrbitLimits,
  azimuthBandOf,
  azimuthDistance,
  captionVisibleFrom,
  clampAngles,
  clampZoom,
  enumerateAzimuthCells,
  enumeratePolarCells,
  geometryRecordsCaseBack,
  isWithinGeometry,
  normalizeAzimuthDeg,
  polarLimits,
  validateGeometry,
  viewDirection,
  visibleCaptions,
  type AnglePair,
  type AzimuthBand,
  type CaptureGeometry,
  type OrbitBounds,
} from './constrained-orbit.js';
export { type FocusTrapHandle, type FocusTrapOptions } from './focus-trap.js';
