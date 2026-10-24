/**
 * The error model.
 *
 * Three kinds, because they arrive, position, and clear differently:
 *
 *  - **field errors**   per input, produced by client rules or mapped from a server code.
 *  - **form errors**    not attributable to one input ("the cart changed", "sign in again").
 *  - **server errors**  the API's answer to this exact submit; they *outrank* the client's opinion.
 *
 * Ranking is what `mergeFieldErrors` encodes. The bug it prevents: a user fixes the field the server
 * complained about, a client rule still fails on the *old* server code, and the form goes back to
 * "invalid" with a message they already acted on. So server errors are attached to a submit
 * generation and dropped as soon as the field they name changes.
 *
 * Warnings are a separate lane, not a severity of error. A `security.*` finding on a listing title
 * must not block a seller who is in the right, but it must not disappear either.
 */

import type { FormIssue, IssueOrigin, IssueParams } from './types.js';
import { isSecurityCode } from './codes.js';

export interface NormalizedFieldError {
  readonly field: string;
  readonly issue: FormIssue;
  readonly origin: IssueOrigin;
  /** Submit generation the server error arrived on; client errors use 0. */
  readonly generation: number;
}

export interface NormalizedFormError {
  readonly issue: FormIssue;
  readonly origin: IssueOrigin;
  readonly generation: number;
}

export interface ErrorState {
  readonly byField: Readonly<Record<string, NormalizedFieldError>>;
  /**
   * Non-blocking findings, kept in a separate map so a `security.*` warning can never be mistaken
   * for a submit blocker and never lands in `order` (which `focusFirstError` walks).
   */
  readonly warnings: Readonly<Record<string, NormalizedFieldError>>;
  readonly form: readonly NormalizedFormError[];
  /** Field paths in insertion order, oldest first. `focus-first-error` reads the first that is visible. */
  readonly order: readonly string[];
}

export const EMPTY_ERROR_STATE: ErrorState = {
  byField: Object.freeze({}),
  warnings: Object.freeze({}),
  form: Object.freeze([]),
  order: Object.freeze([]),
};

export interface ApiErrorShape {
  readonly code: string;
  readonly field?: string | undefined;
  readonly params?: IssueParams | undefined;
  readonly level?: 'error' | 'warning' | undefined;
}

export function fieldError(field: string, issue: FormIssue, origin: IssueOrigin = 'client', generation = 0): NormalizedFieldError {
  return { field, issue, origin, generation };
}

/** Everything a caller needs to render one error: the code, its params, and where it came from. */
export function issueOf(error: NormalizedFieldError | NormalizedFormError): FormIssue {
  return error.issue;
}

export function codeOf(error: NormalizedFieldError | NormalizedFormError): string {
  return error.issue.code;
}

export function isServerOrigin(error: { readonly origin: IssueOrigin }): boolean {
  return error.origin === 'server';
}

/**
 * Security findings block a submit even when the rule returned them as `warning`: the case that
 * matters is a listing whose title renders differently than it sorts, which is exactly what the
 * fraud team needs to see *before* it is live. `optionalText({blockInvisible:false})` therefore
 * still blocks; the difference is that the user gets a specific code rather than "invalid".
 */
export function isBlocking(error: { readonly issue: FormIssue }): boolean {
  if (isSecurityCode(error.issue.code)) return true;
  return error.issue.level !== 'warning';
}

export function blockingFields(state: ErrorState): readonly string[] {
  return state.order.filter((field) => {
    const error = state.byField[field];
    return error !== undefined && isBlocking(error);
  });
}

export function hasBlockingErrors(state: ErrorState): boolean {
  return blockingFields(state).length > 0 || state.form.some((e) => isBlocking(e));
}

/** Non-blocking findings, for the "flagged for review" affordance. */
export function warningList(state: ErrorState): readonly NormalizedFieldError[] {
  return Object.values(state.warnings);
}

/** Merge a partial run into the state, replacing only the fields the run covered. */
export function mergeIntoState(
  previous: ErrorState,
  covered: readonly string[],
  errors: readonly NormalizedFieldError[],
  foundWarnings: readonly NormalizedFieldError[] = [],
): ErrorState {
  const touched = new Set(covered);
  const byField: Record<string, NormalizedFieldError> = {};
  const byWarning: Record<string, NormalizedFieldError> = {};
  for (const [field, error] of Object.entries(previous.byField)) if (!touched.has(field)) byField[field] = error;
  for (const [field, warning] of Object.entries(previous.warnings)) if (!touched.has(field)) byWarning[field] = warning;
  for (const error of errors) byField[error.field] = error;
  for (const warning of foundWarnings) byWarning[warning.field] = warning;
  const order = [
    ...previous.order.filter((f) => !touched.has(f) || f in byField),
    ...errors.map((e) => e.field).filter((f) => !previous.order.includes(f)),
  ];
  return { byField, warnings: byWarning, form: previous.form, order };
}

export function withFieldErrors(previous: ErrorState, errors: readonly NormalizedFieldError[]): ErrorState {
  const byField: Record<string, NormalizedFieldError> = { ...previous.byField };
  const order = [...previous.order];
  for (const error of errors) {
    byField[error.field] = error;
    if (!order.includes(error.field)) order.push(error.field);
  }
  return { byField, warnings: previous.warnings, form: previous.form, order };
}

export function withoutField(previous: ErrorState, field: string): ErrorState {
  const hasError = field in previous.byField;
  const hasWarning = field in previous.warnings;
  if (!hasError && !hasWarning && !previous.form.some((e) => e.issue.params?.field === field)) return previous;
  const byField: Record<string, NormalizedFieldError> = { ...previous.byField };
  const warnings: Record<string, NormalizedFieldError> = { ...previous.warnings };
  delete byField[field];
  delete warnings[field];
  return {
    byField,
    warnings,
    form: previous.form.filter((e) => e.issue.params?.field !== field),
    order: previous.order.filter((f) => f !== field),
  };
}

export function clearAllFieldErrors(state: ErrorState): ErrorState {
  return { ...EMPTY_ERROR_STATE, form: state.form };
}

export function withFormErrors(previous: ErrorState, errors: readonly NormalizedFormError[]): ErrorState {
  return { ...previous, form: errors };
}

/**
 * Merge one field's client and server verdicts. Server wins, always: the client has not seen the
 * database. Called by `validate.ts` after every run.
 */
export function mergeFieldErrors(client: readonly NormalizedFieldError[], server: readonly NormalizedFieldError[]): NormalizedFieldError[] {
  const byField = new Map<string, NormalizedFieldError>();
  for (const error of client) byField.set(error.field, error);
  for (const error of server) byField.set(error.field, error);
  return [...byField.values()];
}

/**
 * Drop a server error the user has made obsolete by editing the field it named.
 *
 * Client errors are *not* dropped here: they must re-run to clear, which is the difference between
 * this package and a form that hides the message while the input is still wrong.
 */
export function dropStaleServerErrors(state: ErrorState, changedField: string): ErrorState {
  const error = state.byField[changedField];
  if (error === undefined || error.origin !== 'server') return state;
  return withoutField(state, changedField);
}

/** For tests and for `server-errors.ts`: build a form error from an API shape. */
export function formErrorFromApi(api: ApiErrorShape, generation: number): NormalizedFormError {
  return { issue: { code: api.code, params: api.params, level: api.level ?? 'error' }, origin: 'server', generation };
}

export function describeErrorCodes(state: ErrorState): string[] {
  return [...state.order.map((f) => state.byField[f]?.issue.code), ...state.form.map((e) => e.issue.code)].filter(
    (c): c is string => typeof c === 'string',
  );
}
