/**
 * `useForm` — the only hook a feature agent should need.
 *
 * Owns one reducer (`form-state.ts`), one validation run per user action, one submit
 * (`submit-guard.ts`), and the a11y wiring (`a11y.ts`). It returns *codes and params*, never
 * sentences: the caller renders them through `@nastech/i18n`.
 *
 * `id` is required rather than generated, because `a11yIds` derives DOM ids from it. Two forms with
 * the same id on one page (a listing sheet over a search page) would cross-wire every label, and the
 * failure is invisible until a screen-reader user gets the wrong announcement — so it throws in dev.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { a11yIds, focusFirstError, statusRegion } from './a11y.js';
import { coerce } from './coerce.js';
import { compileSchema, type CompiledSchema, type FormSchema } from './schema.js';
import {
  createInitialState,
  formReducer,
  isDirty as isFieldDirty,
  isValid as isValidState,
  snapshotOf,
  type FormState,
} from './form-state.js';
import { createSubmitGuard, guardedSubmit, type SubmitGuard } from './submit-guard.js';
import { warningList, type NormalizedFieldError, type NormalizedFormError } from './errors.js';
import type { ApiErrorShape } from './errors.js';
import { normalizeServerErrors } from './server-errors.js';
import { validateForm, type ValidationRun } from './validate.js';
import { validateOn } from './when-to-validate.js';
import type { FieldValueShape, FormValues } from './types.js';

export interface UseFormOptions {
  readonly id: string;
  readonly schema: FormSchema;
  readonly initialValues?: FormValues;
  readonly onSubmit: (values: FormValues, context: { readonly idempotencyKey: string }) => Promise<unknown>;
  /** Lets the page decide *rendering* of a server answer; the mapping rules live in `server-errors.ts`. */
  readonly onServerError?: (errors: readonly ApiErrorShape[]) => void;
  readonly onSuccess?: (result: unknown) => void | Promise<void>;
  readonly onInvalidSubmit?: (run: ValidationRun) => void;
  readonly allowPendingWhileDirty?: boolean;
  /** Dev-time duplicate-id guard. */
  readonly strictIds?: boolean;
}

export interface FieldApi {
  readonly name: string;
  readonly value: FieldValueShape;
  readonly error?: NormalizedFieldError | undefined;
  readonly warning?: NormalizedFieldError | undefined;
  readonly touched: boolean;
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly id: string;
  readonly labelId: string;
  readonly errorId: string;
  readonly descriptionId: string;
  readonly setValue: (value: FieldValueShape) => void;
  readonly onChange: (event: ChangeLikeEvent) => void;
  readonly onBlur: () => void;
}

export interface ChangeLikeEvent {
  readonly target: { readonly value?: unknown; readonly type?: string; readonly checked?: boolean; readonly name?: string };
}

export interface UseFormResult {
  readonly state: FormState;
  readonly values: FormValues;
  readonly schema: CompiledSchema;
  readonly guard: SubmitGuard;
  readonly errors: Readonly<Record<string, NormalizedFieldError>>;
  readonly formErrors: readonly NormalizedFormError[];
  readonly warnings: readonly NormalizedFieldError[];
  readonly canSubmit: boolean;
  readonly pending: boolean;
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly submitted: boolean;
  readonly errorCount: number;
  readonly firstErrorField?: string | undefined;
  readonly statusRegion: ReturnType<typeof statusRegion>;
  readonly getField: (field: string) => FieldApi;
  readonly setValue: (field: string, value: FieldValueShape) => void;
  readonly setValues: (values: FormValues) => void;
  readonly touch: (field: string) => void;
  readonly reset: (values?: FormValues) => void;
  readonly validateNow: (includeExpensive?: boolean) => ValidationRun;
  readonly focusFirstError: () => string | undefined;
  readonly submit: (event?: { preventDefault?: () => void }) => Promise<boolean>;
  readonly applyServerErrors: (errors: readonly ApiErrorShape[], generation?: number) => void;
  readonly lastRun?: ValidationRun | undefined;
}

const ACTIVE_IDS = new Set<string>();

export function useForm(options: UseFormOptions): UseFormResult {
  const schema = useMemo(() => compileSchema(options.schema), [options.schema]);
  const allFieldNames = useMemo(() => schema.fields.map((f) => f.name), [schema]);
  const [state, dispatch] = useReducer(formReducer, options.initialValues ?? {}, createInitialState);
  const guard = useMemo(() => createSubmitGuard(), []);
  const keystrokesSinceTouch = useRef<Record<string, number>>({});
  const lastRun = useRef<ValidationRun | undefined>(undefined);

  const { id: formId, strictIds } = options;
  useEffect(() => {
    if (strictIds === false) return;
    if (ACTIVE_IDS.has(formId)) {
      throw new Error(
        `useForm: duplicate form id "${formId}". a11y ids (label[for], aria-describedby) derive from it, ` +
          'so two forms with one id cross-wire every label between them.',
      );
    }
    ACTIVE_IDS.add(formId);
    return () => {
      ACTIVE_IDS.delete(formId);
    };
  }, [formId, strictIds]);

  // A submit that outlives its component must not hold the guard token, and its answer must not
  // land in a form the user has left.
  useEffect(() => () => guard.abandon(), [guard]);

  /**
   * Validate `fields` against `values` and commit only those fields' errors. Everything else keeps
   * what a previous submit or blur computed — the single most common way hand-rolled forms lose an
   * error message.
   */
  const validateInto = useCallback(
    (values: FormValues, fields: readonly string[], includeExpensive: boolean) => {
      const run = validateForm(schema, values, { only: fields, includeExpensive });
      lastRun.current = run;
      dispatch({
        type: 'merge_field_errors',
        fields: run.outcomes.map((o) => o.field),
        errors: run.errors,
        warnings: run.warnings.filter((w) => run.outcomes.some((o) => o.field === w.field)),
      });
      return run;
    },
    [schema],
  );

  const setValue = useCallback(
    (field: string, value: FieldValueShape) => {
      const compiled = schema.byName[field];
      const stored =
        compiled !== undefined && compiled.kind !== 'opaque' && typeof value === 'string'
          ? coerce(value, compiled.kind, { multiline: compiled.field.multiline }).value
          : value;

      const touched = state.touched[field] === true;
      const hadError = state.errors.byField[field] !== undefined;
      if (touched) keystrokesSinceTouch.current[field] = (keystrokesSinceTouch.current[field] ?? 0) + 1;

      dispatch({ type: 'change', field, value: stored });

      const nextValues: FormValues = { ...state.values, [field]: stored };
      const decision = validateOn({
        trigger: 'change',
        touched,
        hasError: hadError,
        changesSinceTouch: keystrokesSinceTouch.current[field] ?? 0,
      });
      if (decision.run) {
        // Expensive rules are deferred on change by design; the cheap ones still re-run, so a fix
        // clears its own error immediately.
        validateInto(nextValues, [field], decision.includeExpensive);
      } else if (hadError && !touched) {
        dispatch({ type: 'clear_error', field });
      }
    },
    [schema, state.errors.byField, state.touched, state.values, validateInto],
  );

  const touch = useCallback(
    (field: string) => {
      dispatch({ type: 'touch', field });
      keystrokesSinceTouch.current[field] = 0;
      validateInto(state.values, [field], true);
    },
    [state.values, validateInto],
  );

  const getField = useCallback(
    (field: string): FieldApi => {
      const ids = a11yIds(formId, field);
      const error = state.errors.byField[field];
      const warning = state.errors.warnings[field];
      return {
        name: field,
        value: state.values[field],
        error,
        warning,
        touched: state.touched[field] === true,
        dirty: isFieldDirty(state, field),
        pending: state.phase === 'submitting',
        id: ids.input,
        labelId: ids.label,
        errorId: ids.error,
        descriptionId: ids.description,
        setValue: (value) => setValue(field, value),
        onChange: (event) => {
          const target = event.target;
          const raw = target.type === 'checkbox' ? (target.checked ?? false) : (target.value ?? '');
          setValue(field, raw as FieldValueShape);
        },
        onBlur: () => touch(field),
      };
    },
    [formId, setValue, state, touch],
  );

  const focusFirstErrorNow = useCallback((): string | undefined => {
    if (state.errors.order.length === 0) return undefined;
    return focusFirstError(
      typeof document === 'undefined' ? undefined : document,
      formId,
      state.errors.order.map((field) => ({
        field,
        order: Math.max(0, schema.fields.findIndex((f) => f.name === field)),
        level: state.errors.byField[field]?.issue.level,
      })),
    );
  }, [formId, schema.fields, state.errors.byField, state.errors.order]);

  const applyServerErrors = useCallback(
    (errors: readonly ApiErrorShape[], generation = Math.max(1, state.submitCount)) => {
      const normalised = normalizeServerErrors(schema, errors, generation);
      const byField = { ...state.errors.byField };
      for (const error of normalised.fieldErrors) byField[error.field] = error;
      dispatch({
        type: 'set_errors',
        errors: {
          byField,
          warnings: state.errors.warnings,
          form: [...state.errors.form, ...normalised.formErrors],
          order: [...new Set([...state.errors.order, ...normalised.fieldErrors.map((e) => e.field)])],
        },
      });
      options.onServerError?.(errors);
    },
    [options, schema, state.errors.byField, state.errors.form, state.errors.order, state.submitCount],
  );

  const submit = useCallback(
    async (event?: { preventDefault?: () => void }): Promise<boolean> => {
      event?.preventDefault?.();
      dispatch({ type: 'touch_all' });

      const result = await guardedSubmit<ValidationRun | unknown>(
        guard,
        async (idempotencyKey) => {
          // `validate` already ran (see below) and returned a valid run; this is the transport call.
          const run = lastRun.current;
          return options.onSubmit((run?.values ?? state.values) as FormValues, { idempotencyKey });
        },
        {
          // Deliberately *inside* the guard, after the optimistic disable: a validation failure then
          // takes the documented release path, which re-enables the button. A form whose button stays
          // grey after a fix is a lost sale.
          validate: () => {
            const run = validateForm(schema, state.values, { includeExpensive: true });
            lastRun.current = run;
            dispatch({
              type: 'merge_field_errors',
              fields: allFieldNames,
              errors: run.errors,
              warnings: run.warnings,
            });
            if (run.valid) return true;
            options.onInvalidSubmit?.(run);
            return false;
          },
          onSuccess: (value) => {
            dispatch({ type: 'submit_succeeded', values: state.values });
            void options.onSuccess?.(value);
          },
          onError: () => undefined,
        },
      );

      if (result === null) {
        if (guard.snapshot().lastReleaseReason === 'validation_failed') focusFirstErrorNow();
        return false;
      }
      return true;
    },
    [focusFirstErrorNow, guard, options, schema, state.errors.form, state.values],
  );

  const snapshot = snapshotOf(state, { allowPendingWhileDirty: options.allowPendingWhileDirty });

  return {
    state,
    values: state.values,
    schema,
    guard,
    errors: state.errors.byField,
    formErrors: state.errors.form,
    warnings: warningList(state.errors),
    canSubmit: snapshot.canSubmit,
    pending: snapshot.pending,
    dirty: snapshot.dirty,
    valid: isValidState(state),
    submitted: state.submitCount > 0,
    errorCount: snapshot.errorCount,
    firstErrorField: state.errors.order[0],
    statusRegion: statusRegion(formId),
    getField,
    setValue,
    setValues: (values) => dispatch({ type: 'change_many', values }),
    touch,
    reset: (values) => {
      keystrokesSinceTouch.current = {};
      lastRun.current = undefined;
      dispatch({ type: 'reset', values });
    },
    validateNow: (includeExpensive = true) => {
      const run = validateForm(schema, state.values, { includeExpensive });
      lastRun.current = run;
      dispatch({ type: 'merge_field_errors', fields: allFieldNames, errors: run.errors, warnings: run.warnings });
      return run;
    },
    focusFirstError: focusFirstErrorNow,
    submit,
    applyServerErrors,
    lastRun: lastRun.current,
  };
}
