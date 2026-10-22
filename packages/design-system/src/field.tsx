import { useId } from 'react';
import type { ChangeEvent, ClipboardEvent } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export interface FieldBaseProps {
  label: string;
  id?: string;
  name?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (next: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void;
  inputMode?: 'numeric' | 'text' | 'tel' | 'email';
  autoComplete?: string;
  maxLength?: number;
}

/** `1234-5678` and `PIN: 4321` both paste a usable PIN; everything that is not a digit is noise. */
export function pinDigitsFrom(text: string, length = 6): string {
  return text.replace(/\D/g, '').slice(0, length);
}

function describeIds(inputId: string, hint?: string, error?: string): string {
  return [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
    .filter((x): x is string => x !== null)
    .join(' ');
}

/**
 * Label, input, hint and error are bound by id, not by proximity: a screen reader must reach the
 * error from the input even when layout puts them apart. Hint and error are separated by
 * `aria-describedby` order (hint first, error last) so the error is the thing the reader leaves
 * with.
 */
export function TextField({
  label,
  id,
  name,
  hint,
  error,
  required = false,
  value,
  defaultValue,
  placeholder,
  onChange,
  onPaste,
  inputMode,
  autoComplete,
  maxLength,
}: FieldBaseProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = describeIds(inputId, hint, error);

  return (
    <div className="ds-field" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
      <label
        htmlFor={inputId}
        style={{ color: tokens.text.primary, fontFamily: raw.type.familyText, fontSize: '0.875rem', fontWeight: 600 }}
      >
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={inputId}
        name={name ?? inputId}
        type="text"
        required={required}
        placeholder={placeholder}
        aria-invalid={error !== undefined}
        aria-required={required}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        {...(inputMode ? { inputMode } : {})}
        {...(autoComplete ? { autoComplete } : {})}
        {...(maxLength !== undefined ? { maxLength } : {})}
        {...(onChange ? { onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : {})}
        {...(onPaste ? { onPaste } : {})}
        style={{
          border: `1px solid ${error ? raw.color.signalNegative : raw.color.ink300}`,
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s3}`,
          fontFamily: raw.type.familyText,
          fontSize: '1rem',
          color: tokens.text.primary,
          background: tokens.surface.primary,
        }}
      />
      {hint ? (
        <p id={`${inputId}-hint`} style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${inputId}-error`}
          role="alert"
          style={{ margin: 0, color: raw.color.signalNegative, fontSize: '0.8125rem' }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * PIN entry on a phone: the numeric keyboard, not a text one, and the OS one-time-code affordance
 * so a SMS/OTP suggestion lands in the field. Paste is intercepted because autofill of a code
 * arrives with spacing or hyphens that would otherwise poison the value.
 */
export function PinField({
  label = 'Sign-in PIN',
  length = 6,
  onChange,
  ...rest
}: FieldBaseProps & { length?: number }) {
  return (
    <TextField
      {...rest}
      label={label}
      {...(onChange ? { onChange } : {})}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={length}
      onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData('text');
        onChange?.(pinDigitsFrom(pasted, length));
      }}
    />
  );
}
