/**
 * Consent capture, the one field that is a legal record.
 *
 * Three properties the checkout and listing flows both need:
 *
 *  - The checkbox's accessible name is the whole sentence, including the policy link, so a screen
 *    reader user hears exactly what they are agreeing to before they press space. A label that says
 *    "I agree" while the link lives outside it is consent nobody can prove was informed.
 *  - `version` is rendered *and* emitted, because the ledger records which wording a user accepted.
 *    A consent row without a version is a consent row you cannot defend in a dispute.
 *  - Unchecking then re-checking must not silently succeed: `onConsent` fires only when the box is
 *    checked, and the form's `required({ rejectFalse: true })` rule does the rest.
 */

import { useCallback } from 'react';

import { a11yProps } from './a11y.js';
import { FieldMessage, type RenderMessage } from './field-chrome.js';
import type { NormalizedFieldError } from './errors.js';
import { canShowError } from './when-to-validate.js';

export interface ConsentFieldProps {
  readonly formId: string;
  readonly name: string;
  /** The full sentence, e.g. "I agree to the Marketplace Terms". Passed as children so a link fits in. */
  readonly children: React.ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly error?: NormalizedFieldError | undefined;
  readonly touched?: boolean;
  readonly submitted?: boolean;
  readonly disabled?: boolean;
  /** Which wording was accepted. Emitted with the change so the caller can persist it. */
  readonly version: string;
  readonly policyHref?: string;
  readonly renderMessage: RenderMessage;
}

export interface ConsentRecord {
  readonly field: string;
  readonly version: string;
  readonly acceptedAt: number;
}

export function consentRecordOf(field: string, version: string, now = Date.now()): ConsentRecord {
  return { field, version, acceptedAt: now };
}

export function ConsentField(props: ConsentFieldProps): React.ReactElement {
  const {
    formId,
    name,
    children,
    checked,
    onChange,
    error,
    touched = false,
    submitted = false,
    disabled,
    version,
    policyHref,
    renderMessage,
  } = props;

  const { ids, label: labelAttrs, error: errorAttrs } = a11yProps({
    formId,
    field: name,
    hasDescription: false,
    hasError: error !== undefined,
    hasWarning: false,
    required: true,
    disabled,
    type: 'checkbox',
  });

  const showError = error !== undefined && canShowError({ touched, submitted, origin: error.origin });

  const handleChange = useCallback(
    (next: boolean) => {
      onChange(next);
    },
    [onChange],
  );

  return (
    <div className="field field--consent" data-field={name} data-consent-version={version}>
      {/* The label wraps the input: the accessible name is then the entire sentence, links included,
          which is the only arrangement that survives a screen reader reading the field alone. */}
      <label id={labelAttrs.id as string} htmlFor={ids.input} className="field__consent-label">
        <input
          id={ids.input}
          name={name}
          type="checkbox"
          checked={checked}
          disabled={disabled === true}
          required
          aria-describedby={showError ? ids.error : undefined}
          {...(showError ? { 'aria-invalid': 'true' as const } : {})}
          onChange={(event) => handleChange(event.currentTarget.checked)}
        />
        <span className="field__consent-text">
          {children}
          {policyHref !== undefined ? (
            <a href={policyHref} target="_blank" rel="noopener noreferrer">
              {` (open in a new tab)`}
            </a>
          ) : null}
        </span>
      </label>
      <FieldMessage attrs={errorAttrs} issue={showError ? error?.issue : undefined} renderMessage={renderMessage} kind="error" />
    </div>
  );
}
