export {
  projectPoint,
  pixelsPerUnitAtTarget,
  sub3,
  dist3,
  normalize3,
  type Vec3,
  type CaptionCamera,
  type Viewport,
  type Projection,
} from './caption-projector.js';
export { placeHotspot, facingAt, hullClearance, type ConvexBounds, type HotspotPlacement } from './annotation-hotspot.js';
export { severityStyles, markerCss, SEVERITY_ORDER, type Severity, type SeverityStyle } from './severity-styles.js';
export { ConditionCallout, hasDisclosureRef, type ConditionCalloutProps } from './condition-callout.js';
export { ScaleBar, scaleBarLengthPx, isValidMetersPerUnit, SCALE_BAR_METERS, type ScaleBarProps } from './scale-bar.js';
export {
  MeasurementOverlay,
  measureMillimeters,
  formatMillimeters,
  type Caliper,
  type MeasurementOverlayProps,
} from './measurement-overlay.js';
export { Legend, type LegendProps } from './legend.js';
export { ClaimScopeBanner, type ClaimScopeBannerProps } from './claim-scope-banner.js';
export { OverlayRoot, hasVisibleOverlays, type OverlayRootProps } from './overlay-root.js';
