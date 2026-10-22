/**
 * Scene entry point. Anything reachable from here pulls the WebGL runtime, so the fence treats
 * `@nastech/ui-3d/scene` and `@nastech/ui-3d` (which re-exports it) as the same forbidden edge.
 */
export { CanvasHost } from './canvas-host.js';
export type { CanvasHostProps } from './canvas-host.js';

export {
  createDisposalRegistry,
  registerSceneGraph,
  DisposalProvider,
  useDisposable,
  useDisposalRegistry,
  type Disposable,
  type DisposalRegistry,
  type DisposalProviderProps,
} from './disposal-registry.js';

export {
  createContextLossTracker,
  isTerminal,
  type ContextLossState,
  type ContextLossTracker,
  type ContextTransition,
} from './context-loss.js';

export {
  FrameGovernor,
  useGovernorLoop,
  LEVEL_LADDER,
  PIXEL_RATIO_SCALE,
  type FrameGovernorOptions,
  type GovernorLevel,
  type GovernorStats,
} from './frame-governor.js';

export {
  levelFor,
  pixelsPerSecond,
  devicePixelsPerFrame,
  maxSustainedFps,
  governorFrameBudgetMs,
  FRAME_RATES,
  type RenderLevel,
  type CanvasCssSize,
} from './render-budget.js';

export { SceneErrorBoundary, sceneBoundaryKeyFor, type SceneErrorBoundaryProps } from './scene-error-boundary.js';

export {
  createCanvasSizePool,
  capDevicePixels,
  type CanvasSize,
  type CanvasSizePool,
  type CanvasSizePoolOptions,
  type ObserverFactory,
  type PoolObserver,
  type Scheduler,
  type SizeEntry,
} from './canvas-size-pool.js';

export {
  VisibilityGate,
  frameloopForVisibility,
  type VisibilityGateProps,
  type GateEntry,
  type GateObserver,
  type GateObserverFactory,
} from './visibility-gate.js';

export {
  SceneHost,
  planScene,
  type SceneHostProps,
  type ScenePlan,
  type ScenePlanInput,
  type ScenePlanReason,
} from './scene-host.js';

export {
  createModelLoader,
  type ModelLoader,
  type ModelLoaderOptions,
  type ModelLoaderEvent,
  type ModelRenditionRef,
  type ModelLoadHandle,
  type LoadProgress,
  type LoadOptions,
  type GlbParser,
} from './model-loader.js';

export { normalizeToMetric, fitCameraDistance, type MetricNormalization } from './scene-graph.js';

export { LightingRig, lightRigSpec, type LightSpec } from './lighting-rig.js';

export {
  createTelemetryCollector,
  useTelemetryCollector,
  type SceneTelemetrySnapshot,
  type TelemetryCollector,
  type TelemetryMark,
} from './use-3d-telemetry.js';
