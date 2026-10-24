/**
 * The two fields where the buyer's own words are written: severity and the statement.
 *
 * Both carry their caveat next to the input rather than in a footer, because both are places a buyer
 * reasonably believes they are doing something decisive. Choosing "it does not run" feels like
 * ordering a test; writing a long statement feels like making a case. Neither is true, and
 * `severity.ts` says so in the option's own text.
 *
 * The statement box is also the degrade path: when uploads fail, this is where the evidence goes, so
 * it is labelled as evidence rather than as a comment field.
 */

import { useId } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { STATEMENT_LIMITS, statementProblem, statementProblemMessage, DEGRADE_COPY } from '../limits.js';
import { SEVERITY_SCALE, SEVERITY_SCOPE_NOTE, severityGuidance } from './severity.js';
import type { DisputeSeverity } from '../api/dispute-transport.js';
import { Body, Panel } from '../ui.js';

export interface SeverityPickerProps {
  readonly value: DisputeSeverity | null;
  readonly onChange: (value: DisputeSeverity) => void;
  readonly disabled?: boolean;
}

export function SeverityPicker({ value, onChange, disabled = false }: SeverityPickerProps) {
  const groupId = useId();
  return (
    <fieldset
      id="dp-severity"
      style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: raw.space.s2 }}
    >
      <legend style={{ fontFamily: raw.type.familyText, fontSize: '0.9375rem', fontWeight: 600, color: tokens.text.primary, marginBottom: raw.space.s1 }}>
        How bad is it, in your words?
      </legend>
      {SEVERITY_SCALE.map((option) => {
        const checked = value === option.value;
        const guidance = severityGuidance(option.value);
        return (
          <label
            key={option.value}
            htmlFor={`${groupId}-${option.value}`}
            style={{
              display: 'block',
              border: `1px solid ${checked ? tokens.action.default : raw.color.ink100}`,
              borderRadius: raw.radius.md,
              padding: raw.space.s3,
              background: checked ? tokens.surface.raised : tokens.surface.primary,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{ display: 'flex', gap: raw.space.s2, alignItems: 'center' }}>
              <input
                id={`${groupId}-${option.value}`}
                type="radio"
                name="dispute-severity"
                value={option.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <strong style={{ fontFamily: raw.type.familyText, fontSize: '0.9375rem' }}>{option.label}</strong>
            </span>
            <span style={{ display: 'block', marginTop: raw.space.s1, paddingLeft: '1.6rem', fontSize: '0.8125rem', lineHeight: 1.5, color: tokens.text.primary }}>
              {option.whatItMeans}
            </span>
            <span style={{ display: 'block', marginTop: raw.space.s1, paddingLeft: '1.6rem', fontSize: '0.8125rem', lineHeight: 1.5, color: raw.color.ink500 }}>
              {guidance?.helpsTheReviewer}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: raw.space.s1,
                paddingLeft: '1.6rem',
                fontSize: '0.8125rem',
                lineHeight: 1.5,
                color: raw.color.signalCaution,
              }}
            >
              {option.notAPromise}
            </span>
          </label>
        );
      })}
      <p style={{ margin: `${raw.space.s1} 0 0`, fontSize: '0.75rem', color: tokens.text.secondary }}>{SEVERITY_SCOPE_NOTE}</p>
    </fieldset>
  );
}

export interface StatementBoxProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** What the chosen reason wants described. Empty before a reason is picked. */
  readonly guidance?: string;
  readonly disabled?: boolean;
  /** Shown when an upload refused to land: the words are the way the dispute still gets filed. */
  readonly degrading?: boolean;
}

export function StatementBox({ value, onChange, guidance = '', disabled = false, degrading = false }: StatementBoxProps) {
  const id = useId();
  const problem = statementProblem(value);
  const length = value.trim().length;
  const counterId = `${id}-counter`;

  return (
    <Panel title="Describe it as you would to a person" id="dp-statement">
      <div style={{ display: 'grid', gap: raw.space.s2 }}>
        <label htmlFor={id} style={{ fontFamily: raw.type.familyText, fontSize: '0.875rem', fontWeight: 600 }}>
          Your account of what is wrong
        </label>
        {guidance.length > 0 ? (
          <p id={`${id}-guidance`} style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>
            {guidance}
          </p>
        ) : null}
        <textarea
          id={id}
          rows={7}
          value={value}
          disabled={disabled}
          aria-describedby={counterId}
          onChange={(event) => onChange(event.target.value)}
          style={{
            fontFamily: raw.type.familyText,
            fontSize: '1rem',
            lineHeight: 1.5,
            padding: raw.space.s3,
            borderRadius: raw.radius.md,
            border: `1px solid ${problem !== null && length > 0 ? raw.color.signalCaution : raw.color.ink300}`,
            color: tokens.text.primary,
            background: tokens.surface.primary,
            resize: 'vertical',
          }}
        />
        <p id={counterId} style={{ margin: 0, fontSize: '0.8125rem', color: problem === null || problem === 'too_short' ? tokens.text.secondary : raw.color.signalCaution }}>
          {length} of {STATEMENT_LIMITS.maxChars} characters.{' '}
          {problem === null ? 'That is enough for a reviewer to read.' : statementProblemMessage(problem, length)}
        </p>
        {degrading ? (
          <div
            data-testid="dp-degrade"
            style={{
              border: `1px dashed ${raw.color.signalCaution}`,
              borderRadius: raw.radius.md,
              padding: raw.space.s3,
              background: tokens.surface.raised,
            }}
          >
            <strong style={{ fontFamily: raw.type.familyText, fontSize: '0.9375rem' }}>{DEGRADE_COPY.heading}</strong>
            <p style={{ margin: `${raw.space.s1} 0 0`, fontSize: '0.875rem', lineHeight: 1.5 }}>{DEGRADE_COPY.body}</p>
          </div>
        ) : null}
        <Body size="small">
          What you write here stays on this device until you press send. A half-written dispute is an
          allegation about a named person, and it is not something we hold on a server for you.
        </Body>
      </div>
    </Panel>
  );
}
