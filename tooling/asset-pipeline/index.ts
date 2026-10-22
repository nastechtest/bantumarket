/**
 * `@nastech/asset-pipeline` — the studio capture pipeline.
 *
 * Public surface, in the order a job moves through it: intake and its receipt → capture → metric
 * alignment → rendition generation → auto-QC → human QC → manifest → budget gate → upload, with the
 * custody log running underneath all of it. `cli.ts` is the operator's front door; these exports are
 * what CI and the tests use, because the gates have to be callable without a terminal.
 *
 * Nothing here renders a scene and nothing here imports the WebGL runtime: this package runs on a
 * studio machine, not in a browser, and `scripts/check-3d-boundaries.ts` keeps that split honest.
 */

export {
  CaptureError,
  EXIT_CODES,
  FAILURE_SUMMARIES,
  toCaptureError,
  usageError,
  inputInvalid,
  illegalTransition,
  nativeToolMissing,
  geometryNotProduced,
  metricOutOfWindow,
  metricReferenceUnstable,
  qcGateFailed,
  scopeExceedsEvidence,
  budgetExceeded,
  renditionSizeMissing,
  bucketUnavailable,
  checksumMismatch,
  custodyChainBroken,
  captureNotViable,
  type CaptureErrorCode,
  type FailureContext,
  type QcGateFailureBrief,
} from './errors.js';

export {
  JOB_STATES,
  LINEAR_PATH,
  TERMINAL_STATES,
  TRANSITIONS,
  advance,
  assertTransition,
  canTransition,
  createJob,
  isKnownState,
  isTerminal,
  pathProgress,
  type CaptureJob,
  type NewJobInput,
  type TransitionVerdict,
} from './job-state.js';

export {
  CustodyLog,
  GENESIS_HASH,
  digestRow,
  openCustodyLog,
  type ChainVerdict,
  type CustodyEntryInput,
  type CustodyRecord,
} from './custody.js';

export {
  BREAK_EVEN_CENTS,
  CAPTURE_COST_CENTS,
  TAKE_RATE,
  assessCaptureViability,
  issueReceipt,
  matchReceiptToCustody,
  receiptCodeIsWellFormed,
  renderReceiptJson,
  renderReceiptText,
  requireCaptureViability,
  verifyReceiptCode,
  type CaptureViability,
  type CustodyMatch,
  type IntakeReceipt,
  type ReceiptInput,
} from './intake-receipt.js';

export {
  CASE_WINDOW_MM,
  REFERENCE_CARDS,
  REFERENCE_SPREAD_TOLERANCE,
  alignCapture,
  alignmentStillInWindow,
  describeAlignment,
  referenceCard,
  solveMetricScale,
  type AlignmentResult,
  type AlignInput,
  type MetricSolution,
  type ReferenceCard,
  type ReferenceObservation,
} from './metric-align.js';

export {
  DEFAULT_QC_THRESHOLDS,
  GATES,
  assertMeasurements,
  countFrames,
  describeGateResult,
  evaluateGates,
  formatGateValue,
  refuseFromQc,
  runAutoQc,
  scopeSupportedByEvidence,
  type AutoQcVerdict,
  type Comparator,
  type GateClass,
  type GateId,
  type GateResult,
  type QcMeasurements,
  type QcReport,
  type QcThresholds,
} from './auto-qc.js';

export {
  LOD_TARGET_RATIOS,
  POSTER_TARGET_RATIO,
  detectTools,
  findOnPath,
  generateRenditions,
  planRenditions,
  recordProducedFile,
  renditionId,
  renderPlan,
  targetBytesFor,
  type GenOptions,
  type NativeTools,
  type PlannedCommand,
  type ProducedKind,
  type ProducedRendition,
  type RenditionGenInput,
  type RenditionPlan,
} from './rendition-gen.js';

export {
  assertHonestRenditionSize,
  buildManifest,
  narrowerScope,
  scopeWidth,
  spriteRenditionId,
  type CaptionDraft,
  type HumanWiden,
  type ManifestBuildInput,
  type SpriteSpec,
} from './manifest-build.js';

export {
  BUCKET_PREFIX,
  CREDENTIAL_ENV,
  MULTIPART_MIN_PART_BYTES,
  UPLOAD_CHUNK_BYTES,
  assertPrivateBucket,
  chunkPlan,
  declaredDigest,
  deriveRenditionKey,
  describeUpload,
  extensionFor,
  awsCliTransport,
  hashChunks,
  readCredentials,
  redact,
  resolveTransport,
  uploadRenditions,
  type BucketCredentials,
  type BucketTransport,
  type Chunk,
  type ObjectHead,
  type RenditionKeyInput,
  type UploadReceipt,
  type UploadStatus,
  type UploadTarget,
} from './upload.js';

export {
  allRenditions,
  checkPublishedAsset,
  formatBudgetReport,
  requireWithinBudget,
  type AssetTotals,
  type BudgetReport,
  type BudgetViolation,
  type ViolationCode,
} from './budget-check.js';

export { COMMANDS, createIo, parseArgs, runCli, type Command, type Io, type ParsedArgs } from './cli.js';
