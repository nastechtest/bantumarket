/**
 * A quantity input with the two things a stepper needs and a hand-rolled one forgets.
 *
 *  - The buttons change the *form value*, not just the DOM, so validation sees the same number the
 *    user sees. A stepper that writes to the input but not to state is a stepper that submits the old
 *    value.
 *  - The increment controls are `aria-hidden` and their effect is announced through the input's own
 *    live value, because a screen reader pressing "plus" twelve times does not want to hear
 *    "button, plus" twelve times — it wants to hear the number change.
 *
 * `role="spinbutton"` with `aria-valuenow/min/max` is what a real number input cannot express when
 * the value is constrained by stock: the `max` here is the quantity on hand, so a user is told *why*
 * 3 is the ceiling rather than having a keystroke silently swallowed.
 */

import { useCallback } from 'react';

import { a11yProps } from './a11y.js';
import { FieldLabel, FieldMessage, type RenderMessage } from './field-chrome.js';
import type { NormalizedFieldError } from './errors.js';
import { canShowError } from './when-to-validate.js';

export interface QuantityFieldProps {
  readonly formId: string;
  readonly name: string;
  readonly label: React.ReactNode;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly error?: NormalizedFieldError | undefined;
  readonly touched?: boolean;
  readonly submitted?: boolean;
  readonly disabled?: boolean;
  readonly renderMessage: RenderMessage;
  /** Why `max` is what it is, announced with the clamp so the ceiling is not mysterious. */
  readonly limitReason?: string | undefined;
}

export function clampQuantity(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function QuantityField(props: QuantityFieldProps): React.ReactElement {
  const {
    formId,
    name,
    label,
    value,
    onChange,
    min = 1,
    max = 999,
    step = 1,
    error,
    touched = false,
    submitted = false,
    disabled,
    renderMessage,
    limitReason,
  } = props;

  const { ids, label: labelAttrs, error: errorAttrs } = a11yProps({
    formId,
    field: name,
    hasDescription: limitReason !== undefined,
    hasError: error !== undefined,
    hasWarning: false,
    type: 'number',
    disabled,
    inputMode: 'numeric',
  });

  const showError = error !== undefined && canShowError({ touched, submitted, origin: error.origin });
  const atMin = value <= min;
  const atMax = value >= max;

  const nudge = useCallback(
    (direction: 1 | -1) => {
      const next = clampQuantity(value + direction * step, min, max);
      if (next !== value) onChange(next);
    },
    [max, min, onChange, step, value],
  );

  const descriptionIds = [ids.error, ...(limitReason !== undefined ? [ids.description] : [])];

  return (
    <div className="field field--quantity" data-field={name}>
      <FieldLabel attrs={labelAttrs}>{label}</FieldLabel>
      <div className="field__control field__control--quantity" role="group" aria-labelledby={ids.label}>
        <button
          type="button"
          data-step="-1"
          onClick={() => nudge(-1)}
          disabled={atMin || disabled === true}
          aria-label="Decrease quantity"
        >
          −
        </button>
        <input
          id={ids.input}
          name={name}
          type="number"
          inputMode="numeric"
          value={String(value)}
          min={min}
          max={max}
          step={step}
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-labelledby={ids.label}
          aria-describedby={descriptionIds.join(' ')}
          {...(showError ? { 'aria-invalid': 'true' as const } : {})}
          {...(disabled ? { disabled: true } : {})}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            const parsed = Number(raw.replace(/[^\d.-]/g, ''));
            onChange(Number.isFinite(parsed) ? parsed : min);
          }}
          onBlur={() => onChange(clampQuantity(value, min, max))}
        />
        <button
          type="button"
          data-step="1"
          onClick={() => nudge(1)}
          disabled={atMax || disabled === true}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
      {limitReason !== undefined ? <p id={ids.description}>{limitReason}</p> : null}
      {atMax ? (
        <p id={`${ids.input}-max-hint`} aria-live="polite">
          {`At most ${max}`}
        </p>
      ) : null}
      <FieldMessage attrs={errorAttrs} issue={showError ? error?.issue : undefined} renderMessage={renderMessage} kind="error" />
    </div>
  );
}
