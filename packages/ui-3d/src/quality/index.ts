export { probeCapability, canFetchScene, devicePixelRatioCap, continuousRepaintBudgetScale, UNSUPPORTED } from './capability.js';
export { selectLod, checkByteBudget, budgetVerdictFor } from './lod-selection.js';
export {
  createFrameRateGovernor,
  frameBudgetMicrosecondsFor,
  frameBudgetMicrosecondsPerSecond,
  nextLevelDown,
  nextLevelUp,
  QUALITY_LEVELS,
  TARGET_FRAMERATE,
  GOVERNOR_TUNING,
} from './frame-rate-governor.js';
export {
  estimatedBytesFor,
  budgetOk,
  residentCeilingBytes,
  clampTextureSize,
  TRIANGLE_TARGETS,
  TEXTURE_MAPS_PER_TIER,
  MEMORY_MODEL,
} from './memory-pressure.js';
export type { Capability, GlSupport } from './capability.js';
export type { LodDecision, BudgetVerdict } from './lod-selection.js';
export type {
  Clock,
  FrameRateGovernor,
  GovernorDecision,
  GovernorOptions,
  GovernorReason,
  QualityLevel,
  WindowReport,
} from './frame-rate-governor.js';
export type { EstimateOptions, MemoryReason, MemoryVerdict, ResidentEstimate } from './memory-pressure.js';
