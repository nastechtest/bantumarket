/**
 * `@nastech/forms` — one validation and error-presentation answer for all three apps.
 *
 * The surface is deliberately narrow. Every feature agent in this wave is writing a form, and the
 * product only stays coherent if they all reach for the same five things: `useForm`, `useField`, the
 * rule set, the error taxonomy, and the submit guard. Anything else is an internal detail that would
 * otherwise calcify into someone's local convention.
 *
 * What is *not* here, on purpose:
 *  - prose. Validation returns `{ code, params }`; `@nastech/i18n` renders it. A message produced in
 *    this package would be an English string the translation layer has to detect and undo.
 *  - any DOM dependency at import time. `useForm` reads `document` only inside `focusFirstError`, so
 *    the checkout route and a server render both import this safely.
 *  - `@nastech/ui-3d`, `three`, `@react-three/*`, or any feature directory. This package sits on the
 *    `critical` route class (sign-in, checkout, handover, dispute) where the scene runtime is
 *    forbidden outright; `scripts/check-3d-boundaries.ts` enforces it transitively.
 */

export type {
  FieldRule,
  FieldValue,
  FieldValueShape,
  FormIssue,
  FormValues,
  IssueLevel,
  IssueParams,
  LimitUnit,
  RuleName,
  RuleResult,
} from './types.js';

export { ANNOUNCEMENT_CODES, FORM_CODES, SECURITY_CODES, SERVER_CODES, VALIDATION_CODES, isKnownCode, isSecurityCode } from './codes.js';

// ── the hooks ──────────────────────────────────────────────────────────────────────────────────
export { useForm } from './use-form.js';
export type { ChangeLikeEvent, FieldApi, UseFormOptions, UseFormResult } from './use-form.js';

export { useField } from './use-field.js';
export type { FieldBindings, UseFieldInput } from './use-field.js';

// ── schema + rules ─────────────────────────────────────────────────────────────────────────────
export { SchemaError, compileSchema } from './schema.js';
export type { CompiledField, CompiledSchema, FieldKind, FieldSchema, FormSchema, RuleSpec } from './schema.js';

export {
  builtinRuleNames,
  countCharacters,
  countWords,
  email,
  matches,
  oneOf,
  optionalText,
  password,
  passwordCommon,
  postcode,
  priceRange,
  quantity,
  required,
  ruleCatalog,
  securityIssues,
  zaPhone,
} from './rules.js';
export type {
  OptionalTextOptions,
  PasswordOptions,
  PriceRangeOptions,
  QuantityOptions,
  RequiredOptions,
  RuleFactoryCatalog,
} from './rules.js';

export { validateField, validateForm } from './validate.js';
export type { FieldOutcome, ValidateOptions, ValidationRun } from './validate.js';

export { coerce, asString, centsToInputString, sanitiseValue } from './coerce.js';
export type { CoerceKind, CoerceOptions, Coerced } from './coerce.js';

// ── state machine ──────────────────────────────────────────────────────────────────────────────
export {
  createInitialState,
  formReducer,
  isDirty,
  isTouched,
  isValid,
  snapshotOf,
} from './form-state.js';
export type { FormAction, FormPhase, FormSnapshot, FormState } from './form-state.js';

export { validateOn, canShowError, shouldValidateOnChange, createDebouncer, CHANGE_DEBOUNCE_MS } from './when-to-validate.js';
export type { DebouncedSchedule, ValidationDecision, ValidationTrigger } from './when-to-validate.js';

// ── errors ─────────────────────────────────────────────────────────────────────────────────────
export {
  EMPTY_ERROR_STATE,
  blockingFields,
  clearAllFieldErrors,
  codeOf,
  describeErrorCodes,
  dropStaleServerErrors,
  fieldError,
  formErrorFromApi,
  hasBlockingErrors,
  isBlocking,
  isServerOrigin,
  mergeFieldErrors,
  mergeIntoState,
  warningList,
  withFieldErrors,
  withFormErrors,
  withoutField,
} from './errors.js';
export type { ApiErrorShape, ErrorState, NormalizedFieldError, NormalizedFormError } from './errors.js';

export { extractApiErrors, normalizeErrorsForSchema, normalizeServerEnvelope, normalizeServerErrors } from './server-errors.js';
export type { NormalisedServerResponse, ServerFieldBinding } from './server-errors.js';

// ── submit ─────────────────────────────────────────────────────────────────────────────────────
export { createSubmitGuard, guardedSubmit, isServerError } from './submit-guard.js';
export type { GuardSnapshot, ReleaseReason, StartPermit, SubmitGuard } from './submit-guard.js';

// ── accessibility ───────────────────────────────────────────────────────────────────────────────
export {
  a11yIds,
  a11yProps,
  announcementFor,
  auditLabels,
  errorSummary,
  focusFirstError,
  statusRegion,
  summaryLinkFor,
} from './a11y.js';
export type { A11yIds, A11yPropsInput, AriaAttrs, FocusableField } from './a11y.js';

// ── sanitisation ─────────────────────────────────────────────────────────────────────────────────
export { clean, describeInvisibles, parseDigits, parseZaNsn, parseZarAmount, sanitise } from './deploit.js';
export type { FlaggedChar, ParsedMoney, RemovedChar, SanitisedInput, SanitiseOptions } from './deploit.js';
export { formatCodepoint, scanConfusables, scanInvisible } from './text.js';
export type { ConfusableHit, InvisibleClass, InvisibleHit, InvisibleScan } from './text.js';

// ── fields ─────────────────────────────────────────────────────────────────────────────────────
export { FieldHint, FieldLabel, FieldMessage, FormStatusRegion } from './field-chrome.js';
export type { RenderMessage } from './field-chrome.js';

export { MoneyField, moneyCentsOf, readMoneyInput } from './money-field.js';
export type { MoneyFieldProps, MoneyFieldResult } from './money-field.js';

export { QuantityField, clampQuantity } from './quantity-field.js';
export type { QuantityFieldProps } from './quantity-field.js';

export { ConsentField, consentRecordOf } from './consent-field.js';
export type { ConsentFieldProps, ConsentRecord } from './consent-field.js';
