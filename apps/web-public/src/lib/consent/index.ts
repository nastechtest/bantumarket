/**
 * `lib/consent` — the POPIA record substrate, importable by any feature without pulling in analytics.
 *
 * Kept separate from `features/analytics/consent` on purpose: the banner and the gates are analytics
 * UI, the record is a legal artefact that auth, account and a future staff access-request screen all
 * have to read.
 */
export type {
  CategoryDecision,
  ConsentCategory,
  ConsentMethod,
  ConsentRecord,
  ConsentStorage,
  DecisionValue,
} from './types.js';
export {
  CONSENT_CATEGORIES,
  CONSENT_GATED,
  CONSENT_METHODS,
  CONSENT_STORAGE_KEY,
  DECISION_CATEGORIES,
  DECISION_LOG_CAP,
  NEVER_COLLECTED,
  isConsentCategory,
  isConsentMethod,
} from './types.js';
export type { DecisionInit } from './record.js';
export {
  CONSENT_NOTICE_VERSION,
  ConsentRecordError,
  categoryAllowed,
  decisionFor,
  eraseRecord,
  grantedCategories,
  hasExplicitDecision,
  initialRecord,
  loadRecord,
  parseRecord,
  persistRecord,
  recordForExport,
  serialiseRecord,
  withDecision,
  withDecisions,
  withdraw,
} from './record.js';
export type { WebStorageOptions } from './storage.js';
export { memoryStorage, unavailableStorage, webStorage } from './storage.js';
