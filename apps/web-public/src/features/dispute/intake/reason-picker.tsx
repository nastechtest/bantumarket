/**
 * The reason picker — and the first place the honesty rule bites.
 *
 * A picker that only shows labels would let a buyer choose "it does not keep time" and still believe
 * they are about to get a movement checked. So every row carries its own scope line, generated from
 * `../claim-scope.ts` rather than hand-written per reason: the moment a buyer reads the option, they
 * read whether that option is something NasTech can decide. The feedback is on the choice, not
 * behind it.
 */

import { raw, tokens } from '@nastech/design-tokens';
import { claimIsOutsidePlatformScope } from '../claim-scope.js';
import { DISPUTE_REASONS } from '../reasons.js';
import { Body, Panel } from '../ui.js';

export interface ReasonPickerProps {
  readonly selected: string | null;
  readonly onSelect: (code: string) => void;
  readonly disabled?: boolean;
}

export function scopeLineFor(code: string): string {
  const reason = DISPUTE_REASONS.find((r) => r.code === code);
  if (reason === undefined) return '';
  const outside = reason.claims.filter(claimIsOutsidePlatformScope);
  if (outside.length === 0) {
    return 'NasTech can compare this against the listing and the condition record.';
  }
  return `NasTech cannot check this itself — it is about ${outside.map((c) => c.replace(/_/g, ' ')).join(', ')}. You will still be able to send it, and we will tell you where else to take it.`;
}

export function ReasonPicker({ selected, onSelect, disabled = false }: ReasonPickerProps) {
  return (
    <Panel title="What is wrong?" id="dp-reason" meta="Pick the closest one. You get to describe it in your own words next.">
      <fieldset
        style={{
          border: 0,
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: raw.space.s2,
        }}
      >
        <legend
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        >
          Reason for the dispute
        </legend>
        {DISPUTE_REASONS.map((reason) => {
          const checked = selected === reason.code;
          const id = `dp-reason-${reason.code}`;
          const outside = reason.claims.some(claimIsOutsidePlatformScope);
          return (
            <div
              key={reason.code}
              style={{
                border: `1px solid ${checked ? tokens.action.default : raw.color.ink100}`,
                borderLeft: `3px solid ${checked ? tokens.action.default : outside ? raw.color.signalCaution : raw.color.ink100}`,
                borderRadius: raw.radius.md,
                padding: raw.space.s3,
                background: checked ? tokens.surface.raised : tokens.surface.primary,
              }}
            >
              <label htmlFor={id} style={{ display: 'block', cursor: disabled ? 'not-allowed' : 'pointer' }}>
                <input
                  type="radio"
                  id={id}
                  name="dispute-reason"
                  value={reason.code}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onSelect(reason.code)}
                  style={{ marginRight: raw.space.s2 }}
                />
                <span
                  style={{
                    fontFamily: raw.type.familyText,
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: tokens.text.primary,
                  }}
                >
                  {reason.label}
                </span>
              </label>
              <p
                id={`${id}-scope`}
                style={{
                  margin: `${raw.space.s1} 0 0`,
                  paddingLeft: '1.75rem',
                  fontSize: '0.8125rem',
                  lineHeight: 1.5,
                  fontFamily: raw.type.familyText,
                  color: outside ? raw.color.signalCaution : tokens.text.secondary,
                }}
              >
                {scopeLineFor(reason.code)}
              </p>
            </div>
          );
        })}
      </fieldset>
      <div style={{ marginTop: raw.space.s3 }}>
        <Body size="small">
          If none of these is your problem, pick the nearest one and say what it really is in your own
          words below. A reason code never decides your dispute; your description does.
        </Body>
      </div>
    </Panel>
  );
}
