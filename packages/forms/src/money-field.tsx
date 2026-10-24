/**
 * The price input, because a price is where the money is.
 *
 * Storage is whole cents (`Money.cents` in api-contracts) and the DOM is a string, so this component
 * owns the boundary in both directions. Two rules with teeth:
 *
 *  - The user's text is *never* rewritten while they are typing. `R1.200` must not become `12` mid
 *    keystroke, and a value that does not parse keeps its string so the user can fix it rather than
 *    watch it vanish. Cents are derived on commit (blur) and on submit.
 *  - Fullwidth digits, NBSP separators and a leading `R` are all accepted by the parser — a seller
 *    typing `１２００` on a phone keyboard is not making a formatting error, and refusing them is how
 *    a listing never gets created. `1.200` is R1 200, not R1.20: that is the SA convention and the
 *    one a naive parser gets a hundred-fold wrong.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { a11yProps } from './a11y.js';
import { centsToInputString, coerce } from './coerce.js';
import { clean, parseZarAmount } from './deploit.js';
import { FieldLabel, FieldMessage, type RenderMessage } from './field-chrome.js';
import type { NormalizedFieldError } from './errors.js';
import { canShowError } from './when-to-validate.js';
import type { FormIssue } from './types.js';

export interface MoneyFieldProps {
  readonly formId: string;
  readonly name: string;
  readonly label: React.ReactNode;
  /** Whole cents, the ledger's unit. */
  readonly value?: number | undefined;
  readonly onChangeValue?: (cents: number | undefined, raw: string) => void;
  readonly touched?: boolean;
  readonly submitted?: boolean;
  readonly error?: NormalizedFieldError | undefined;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly hintId?: string;
  readonly hint?: React.ReactNode;
  readonly autocomplete?: string;
  readonly renderMessage: RenderMessage;
  readonly minCents?: number;
  readonly maxCents?: number;
}

export interface MoneyFieldResult {
  readonly cents?: number | undefined;
  readonly raw: string;
  readonly issue?: FormIssue | undefined;
}

/** Exported for the seller app's "as you type" total and for tests. */
export function readMoneyInput(raw: string): MoneyFieldResult {
  const text = clean(raw);
  if (text === '') return { raw, cents: undefined };
  const parsed = parseZarAmount(text);
  if (!parsed.ok) {
    return {
      raw,
      cents: undefined,
      issue: {
        code: parsed.reason === 'negative' ? 'validation.price.range' : parsed.reason === 'too_precise' ? 'validation.price.format' : 'validation.price.format',
        params: { value: raw },
      },
    };
  }
  return { raw, cents: parsed.cents };
}

export function MoneyField(props: MoneyFieldProps): React.ReactElement {
  const {
    formId,
    name,
    label,
    value,
    onChangeValue,
    touched = false,
    submitted = false,
    error,
    required,
    disabled,
    hintId,
    hint,
    autocomplete = 'off',
    renderMessage,
  } = props;

  const { ids, input: inputAttrs, label: labelAttrs, error: errorAttrs } = a11yProps({
    formId,
    field: name,
    hasDescription: hint !== undefined,
    hasError: error !== undefined,
    hasWarning: false,
    required,
    disabled,
    type: 'text',
    autocomplete,
    inputMode: 'decimal',
    describedByExtra: hintId !== undefined ? [hintId] : [],
  });

  // Local text state is what lets `R1.200` survive a keystroke; `value` only pulls it in from outside.
  const [text, setText] = useState<string>(() => (value === undefined ? '' : centsToInputString(value)));
  const [lastExternal, setLastExternal] = useState<number | undefined>(value);

  useEffect(() => {
    if (value !== lastExternal) {
      setText(value === undefined ? '' : centsToInputString(value));
      setLastExternal(value);
    }
  }, [value, lastExternal]);

  const showError = error !== undefined && canShowError({ touched, submitted, origin: error.origin });

  const descriptionIds = useMemo(() => {
    const declared = inputAttrs['aria-describedby'];
    const parts: string[] = declared === undefined ? [] : String(declared).split(/\s+/).filter(Boolean);
    if (showError) parts.push(ids.error);
    return parts;
  }, [ids.error, inputAttrs, showError]);

  const handleInput = (event: FormEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value;
    setText(raw);
    const read = readMoneyInput(raw);
    // Emit a number only when the text parses; otherwise `undefined` with the raw kept for the rule.
    onChangeValue?.(read.cents, raw);
  };

  const handleBlur = () => {
    const read = readMoneyInput(text);
    const normalised = read.cents === undefined ? clean(text) : centsToInputString(read.cents);
    if (normalised !== text) setText(normalised);
    onChangeValue?.(read.cents, normalised);
  };

  return (
    <div className="field field--money" data-field={name}>
      <FieldLabel attrs={labelAttrs} required={required}>
        {label}
      </FieldLabel>
      <div className="field__control field__control--money">
        <span className="field__prefix" aria-hidden="true">
          R
        </span>
        <input
          id={ids.input}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete={autocomplete}
          aria-labelledby={ids.label}
          {...(descriptionIds.length > 0 ? { 'aria-describedby': descriptionIds.join(' ') } : {})}
          {...(showError ? { 'aria-invalid': 'true' as const } : {})}
          {...(required ? { required: true } : {})}
          {...(disabled ? { disabled: true } : {})}
          value={text}
          onInput={handleInput}
          onChange={handleInput}
          onBlur={handleBlur}
          data-money-raw={text}
        />
      </div>
      {hint !== undefined ? <p id={hintId ?? ids.description}>{hint}</p> : null}
      <FieldMessage attrs={errorAttrs} issue={showError ? error?.issue : undefined} renderMessage={renderMessage} kind="error" />
    </div>
  );
}

/** Same coercion `useForm` applies, exposed so a page can pre-flight a price without a schema. */
export function moneyCentsOf(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isInteger(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  return coerce(value, 'money').value as number | undefined;
}
