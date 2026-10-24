/**
 * Asking for a second look — and saying what a second look is.
 *
 * Escalation is the place a dispute UI most easily lies, because "escalate to our senior team" implies
 * a deeper capability rather than a more senior reader of the same three documents. It is not: the
 * person at the other end cannot hear a movement, cannot put a case on a pressure bench, and cannot
 * authenticate a dial from a photograph either. So the panel states that before the note box and again
 * after the service answers, using the `outsidePlatformScope` list the service itself returns.
 *
 * The reference number is the useful part, and it is the only thing here that outlives the screen.
 */

import { useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { EscalationDto } from '../api/dispute-transport.js';
import { CLAIM_KIND_LABELS } from '../claim-scope.js';
import type { ClaimVerdict } from '../claim-scope.js';
import { STATEMENT_LIMITS, statementProblem } from '../limits.js';
import { ActionButton, Body, Panel } from '../ui.js';

export interface EscalationNoteProps {
  readonly verdict: ClaimVerdict;
  readonly escalation: EscalationDto | null;
  readonly onEscalate: (note: string) => void;
  readonly busy: boolean;
}

export function EscalationNote({ verdict, escalation, onEscalate, busy }: EscalationNoteProps) {
  const [note, setNote] = useState('');
  const problem = statementProblem(note);
  const outside = verdict.outsideClaims.map((k) => CLAIM_KIND_LABELS[k].toLowerCase());

  if (escalation !== null) {
    return (
      <Panel title="A senior reviewer has the file" id="dp-escalation" meta={`Reference ${escalation.ref}`}>
        <div style={{ display: 'grid', gap: raw.space.s3 }}>
          <Body>{escalation.whatHappensNext}</Body>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
              What they still cannot determine
            </p>
            <ul style={{ margin: `${raw.space.s1} 0 0`, paddingLeft: '1.1rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
              {escalation.outsidePlatformScope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <Body size="small">
            Keep the reference. It is the thing the Ombud, a small claims commissioner or a service centre will
            ask for, and it is the only part of this screen that travels outside NasTech.
          </Body>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Ask for a second look" id="dp-escalation">
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <Body size="small">
          A second reader sees the same record you have already described: the listing, the condition
          disclosure, your photographs and your words. {outside.length > 0 ? (
            <>
              They cannot determine <strong>{outside.join(' and ')}</strong> either — that is not a shortage of
              seniority, it is what the item being in your hands rather than in a workshop means.
            </>
          ) : (
            'It is worth asking for when you believe the first reading missed something in that record.'
          )}
        </Body>
        <div style={{ display: 'grid', gap: raw.space.s2 }}>
          <label htmlFor="dp-escalation-note" style={{ fontFamily: raw.type.familyText, fontSize: '0.875rem', fontWeight: 600 }}>
            What the first reading got wrong
          </label>
          <textarea
            id="dp-escalation-note"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            style={{
              fontFamily: raw.type.familyText,
              fontSize: '1rem',
              lineHeight: 1.5,
              padding: raw.space.s3,
              borderRadius: raw.radius.md,
              border: `1px solid ${raw.color.ink300}`,
              resize: 'vertical',
            }}
          />
          <p style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>
            {note.trim().length} characters.{' '}
            {problem === 'too_short'
              ? `Say which line of the record was read wrongly — ${STATEMENT_LIMITS.minChars - note.trim().length} more characters.`
              : problem === 'too_long'
                ? `Over ${STATEMENT_LIMITS.maxChars} characters.`
                : 'That is enough for a reader to start from.'}
          </p>
          <div>
            <ActionButton onClick={() => onEscalate(note)} disabled={problem !== null || busy}>
              {busy ? 'Sending…' : 'Ask for a second look'}
            </ActionButton>
          </div>
        </div>
        {verdict.recourse.length > 0 ? (
          <Body size="small">
            For {verdict.recourse.length === 1 ? 'the claim' : 'the claims'} outside what we can decide, the
            external route is the one with real power over it. Escalating does not replace it and does not run
            in parallel with a promise attached to either.
          </Body>
        ) : null}
      </div>
    </Panel>
  );
}
