/**
 * The single reducer for form state.
 *
 * One reducer, one action set: a form in three apps must agree on what `dirty` means, otherwise the
 * unsaved-changes warning fires in web-seller and not in web-staff and someone loses a listing.
 *
 * The invariants that are easy to get wrong and are asserted in `form-state.test.ts`:
 *  - `touched` is monotonic — once touched, always touched. An untouched field never shows an error.
 *  - `dirty` is *content*-based, compared against `initialValues`, so `''` → `''` is not dirty and
 *    `''` → `'a'` → `''` is pristine again.
 *  - `submitted` survives a failed submit; `pending` does not.
 *  - `submit_succeeded` resets `dirty` against the new values: what just saved is no longer unsaved.
 */

import {
  EMPTY_ERROR_STATE,
  dropStaleServerErrors,
  mergeIntoState,
  withoutField,
  type ErrorState,
  type NormalizedFieldError,
  type NormalizedFormError,
} from './errors.js';
import type { FieldValueShape, FormValues } from './types.js';

export type FormPhase = 'pristine' | 'editing' | 'validating' | 'submitting' | 'failed' | 'succeeded';

export interface FormState {
  readonly values: FormValues;
  readonly initialValues: FormValues;
  readonly touched: Readonly<Record<string, boolean>>;
  readonly errors: ErrorState;
  readonly phase: FormPhase;
  /** Monotonic submit counter; `errors.generation` is compared against it. */
  readonly submitCount: number;
  /** Idempotency key handed to the transport for the current in-flight submit. */
  readonly idempotencyKey?: string | undefined;
  readonly lastSubmitAt?: number | undefined;
}

export type FormAction =
  | { readonly type: 'change'; readonly field: string; readonly value: FieldValueShape }
  | { readonly type: 'change_many'; readonly values: FormValues }
  | { readonly type: 'touch'; readonly field: string }
  | { readonly type: 'blur'; readonly field: string }
  | { readonly type: 'set_errors'; readonly errors: ErrorState }
  /**
   * Replace the errors for exactly `fields` (the ones a partial validation run covered) and leave
   * every other field's error alone. Without this, a blur on one field would clear the errors the
   * previous submit computed for the rest of the form.
   */
  | {
      readonly type: 'merge_field_errors';
      readonly fields: readonly string[];
      readonly errors: readonly NormalizedFieldError[];
      readonly warnings?: readonly NormalizedFieldError[] | undefined;
    }
  | { readonly type: 'set_form_errors'; readonly errors: readonly NormalizedFormError[] }
  | { readonly type: 'touch_all' }
  | { readonly type: 'clear_error'; readonly field: string }
  | { readonly type: 'clear_all_errors' }
  | { readonly type: 'submit_start'; readonly generation: number; readonly idempotencyKey: string }
  | { readonly type: 'submit_failed'; readonly generation: number; readonly errors: ErrorState }
  | { readonly type: 'submit_succeeded'; readonly values?: FormValues | undefined }
  | { readonly type: 'reset'; readonly values?: FormValues | undefined };

export function createInitialState(initialValues: FormValues = {}): FormState {
  return {
    values: { ...initialValues },
    initialValues: { ...initialValues },
    touched: {},
    errors: EMPTY_ERROR_STATE,
    phase: 'pristine',
    submitCount: 0,
  };
}

export function isDirty(state: FormState, field?: string): boolean {
  if (field !== undefined) return !sameValue(state.values[field], state.initialValues[field]);
  const keys = new Set([...Object.keys(state.values), ...Object.keys(state.initialValues)]);
  for (const key of keys) {
    if (!sameValue(state.values[key], state.initialValues[key])) return true;
  }
  return false;
}

/** `null` and `''` are the same answer here; `0` and `''` are not. */
function sameValue(a: FieldValueShape, b: FieldValueShape): boolean {
  const norm = (v: FieldValueShape): FieldValueShape => (v === null ? '' : v);
  const x = norm(a);
  const y = norm(b);
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y)) return false;
    return x.length === y.length && x.every((item, i) => item === y[i]);
  }
  return x === y;
}

export function isTouched(state: FormState, field: string): boolean {
  return state.touched[field] === true;
}

export function isValid(state: FormState): boolean {
  return Object.keys(state.errors.byField).length === 0 && state.errors.form.length === 0;
}

export function phaseOf(state: FormState): FormState['phase'] {
  return state.phase;
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'change': {
      const values = { ...state.values, [action.field]: action.value };
      const next: FormState = {
        ...state,
        values,
        // Editing a field retires the server's opinion about *that* field only.
        errors: dropStaleServerErrors(state.errors, action.field),
        phase: state.phase === 'submitting' ? state.phase : isDirty({ ...state, values }) ? 'editing' : 'pristine',
      };
      return next;
    }

    case 'change_many': {
      const values: FormValues = { ...state.values, ...action.values };
      let errors = state.errors;
      for (const field of Object.keys(action.values)) errors = dropStaleServerErrors(errors, field);
      return {
        ...state,
        values,
        errors,
        phase: state.phase === 'submitting' ? state.phase : isDirty({ ...state, values }) ? 'editing' : 'pristine',
      };
    }

    case 'touch':
    case 'blur': {
      if (state.touched[action.field] === true) return state;
      return { ...state, touched: { ...state.touched, [action.field]: true } };
    }

    case 'set_errors':
      return { ...state, errors: action.errors, phase: errorsPhase(state, action.errors) };

    case 'merge_field_errors': {
      const next = mergeIntoState(state.errors, action.fields, action.errors, action.warnings ?? []);
      return { ...state, errors: next, phase: errorsPhase(state, next) };
    }

    case 'set_form_errors': {
      const next: ErrorState = { ...state.errors, form: action.errors };
      return { ...state, errors: next, phase: errorsPhase(state, next) };
    }

    case 'touch_all': {
      const touched: Record<string, boolean> = { ...state.touched };
      for (const field of Object.keys(state.values)) touched[field] = true;
      return { ...state, touched };
    }

    case 'clear_error':
      return { ...state, errors: withoutField(state.errors, action.field) };

    case 'clear_all_errors':
      return { ...state, errors: EMPTY_ERROR_STATE, phase: state.phase === 'failed' ? 'editing' : state.phase };

    case 'submit_start':
      // `pending` is a flag *and* a phase: `canSubmit` reads the flag, the UI reads the phase.
      return {
        ...state,
        phase: 'submitting',
        submitCount: action.generation,
        idempotencyKey: action.idempotencyKey,
        lastSubmitAt: Date.now(),
      };

    case 'submit_failed':
      return { ...state, phase: 'failed', errors: action.errors };

    case 'submit_succeeded': {
      const values = action.values ?? state.values;
      return {
        ...state,
        values,
        initialValues: { ...values },
        phase: 'succeeded',
        errors: EMPTY_ERROR_STATE,
        idempotencyKey: undefined,
      };
    }

    case 'reset': {
      const values = action.values ?? state.initialValues;
      return {
        ...createInitialState(values),
        phase: 'pristine',
        submitCount: state.submitCount,
      };
    }
  }
}

function errorsPhase(state: FormState, errors: ErrorState): FormPhase {
  if (state.phase === 'submitting') return 'submitting';
  const hasErrors = Object.keys(errors.byField).length > 0 || errors.form.length > 0;
  if (hasErrors) return 'failed';
  return isDirty(state) ? 'editing' : 'pristine';
}

/** Derived, memo-friendly snapshot the components read. Keeping it a function means the reducer stays pure. */
export interface FormSnapshot {
  readonly canSubmit: boolean;
  readonly pending: boolean;
  readonly dirty: boolean;
  readonly allTouched: boolean;
  readonly errorCount: number;
  readonly phase: FormPhase;
}

export function snapshotOf(state: FormState, opts?: { allowPendingWhileDirty?: boolean | undefined }): FormSnapshot {
  const pending = state.phase === 'submitting';
  const dirty = isDirty(state);
  const errorCount = Object.keys(state.errors.byField).length + state.errors.form.length;
  return {
    canSubmit: !pending && (opts?.allowPendingWhileDirty === true || errorCount === 0),
    pending,
    dirty,
    allTouched: Object.keys(state.values).every((f) => state.touched[f] === true),
    errorCount,
    phase: state.phase,
  };
}
