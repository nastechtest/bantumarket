/**
 * `useField` — one field's slice of a form, with its a11y wiring already computed.
 *
 * The reason this exists as a hook rather than as five props on every input: a11y mistakes are not
 * visible to the person making them. A missing `aria-describedby` looks identical to a correct one
 * in a screenshot, so a component that has to remember to wire it will eventually forget, and the
 * bug only reaches a screen-reader user. `useField` returns the attribute bags already linked, and
 * `a11y.test.tsx` proves the output is a labelled, described, `aria-invalid` input.
 *
 * `showError` is `canShowError` from the timing policy: an untouched field with a client error does
 * not show it. That is the difference between "helpful" and "the form is judging me while I type".
 */

import { useMemo } from 'react';

import { a11yProps, type A11yPropsInput, type AriaAttrs, type A11yIds } from './a11y.js';
import type { NormalizedFieldError } from './errors.js';
import { canShowError, type ValidationTrigger } from './when-to-validate.js';
import type { FieldValueShape } from './types.js';

export interface UseFieldInput {
  readonly formId: string;
  readonly name: string;
  readonly value: FieldValueShape;
  readonly touched: boolean;
  readonly submitted: boolean;
  readonly error?: NormalizedFieldError | undefined;
  readonly warning?: NormalizedFieldError | undefined;
  readonly serverError?: boolean;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly hasDescription?: boolean;
  readonly describedByExtra?: readonly string[];
  readonly type?: A11yPropsInput['type'];
  readonly autocomplete?: string;
  readonly inputMode?: A11yPropsInput['inputMode'];
  readonly multiline?: boolean;
  /** Hard DOM cap so a user cannot type past `maxLength`; paired with the rule, not instead of it. */
  readonly maxLengthAttr?: number;
  readonly onChange: (event: { readonly target: { readonly value: unknown; readonly type?: string; readonly checked?: boolean } }) => void;
  readonly onBlur: () => void;
}

export interface FieldBindings {
  readonly ids: A11yIds;
  readonly input: AriaAttrs & { readonly maxLength?: number | undefined };
  readonly label: AriaAttrs;
  readonly error: AriaAttrs;
  readonly showError: boolean;
  readonly showWarning: boolean;
  readonly invalid: boolean;
  readonly trigger: ValidationTrigger;
}

export function useField(input: UseFieldInput): FieldBindings {
  return useMemo(() => {
    const hasError = input.error !== undefined;
    const hasWarning = !hasError && input.warning !== undefined;
    const wiring = a11yProps({
      formId: input.formId,
      field: input.name,
      hasDescription: input.hasDescription === true,
      hasError,
      hasWarning,
      required: input.required,
      disabled: input.disabled,
      pending: input.pending,
      type: input.type,
      autocomplete: input.autocomplete,
      inputMode: input.inputMode,
      describedByExtra: input.describedByExtra,
    });

    const showError =
      hasError &&
      canShowError({
        touched: input.touched,
        submitted: input.submitted,
        origin: input.serverError === true ? 'server' : 'client',
      });
    // A warning is advisory, so it is held until the user has left the field: showing "this may be a
    // lookalike brand" mid-typing is noise, showing it on blur is a hint.
    const showWarning = hasWarning && (input.touched || input.submitted);

    return {
      ids: wiring.ids,
      input: { ...wiring.input, ...(input.maxLengthAttr !== undefined ? { maxLength: input.maxLengthAttr } : {}) } as AriaAttrs & { maxLength?: number | undefined },
      label: wiring.label,
      error: { ...wiring.error, ...(showError || showWarning ? {} : { hidden: true }) } as AriaAttrs,
      showError,
      showWarning,
      invalid: hasError && showError,
      trigger: 'change',
    };
  }, [input]);
}
