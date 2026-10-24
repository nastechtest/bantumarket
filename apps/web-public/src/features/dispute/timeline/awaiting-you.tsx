/**
 * "The service is waiting on you", in the service's words.
 *
 * The instruction is rendered verbatim from `awaitingYou.instruction` rather than assembled from a
 * template keyed on `kind`, because the thing a buyer most needs from this panel is the question as it
 * was actually asked — a paraphrased question is how an answer ends up not addressing it. `kind` only
 * chooses the shape of the reply control.
 *
 * The reply box never requires a file. If uploads are broken, the words still go through; the whole
 * premise of the intake's degrade path is that a storage failure must not become a missed deadline.
 */

import { useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { AwaitRequestDto } from '../api/dispute-transport.js';
import { formatLongDate } from '../clock.js';
import { STATEMENT_LIMITS, statementProblem, DEGRADE_COPY } from '../limits.js';
import { ActionButton, Body, Panel } from '../ui.js';

export interface AwaitingYouProps {
  readonly request: AwaitRequestDto;
  readonly onRespond: (message: string) => void;
  readonly busy: boolean;
  /** Whether the buyer is looking at this as the buyer or the seller; the panel is only shown to the
   *  party the service named. */
  readonly party: 'buyer' | 'seller';
}

/** The page only renders this panel to the party the service named. `sla.awaiting` is the authority —
 *  reading it off `awaitingYou` instead would let a stale instruction from an earlier round nag the
 *  wrong person after they had already replied. */
export function awaitingIsForParty(awaiting: 'buyer' | 'seller' | 'service' | undefined, party: 'buyer' | 'seller'): boolean {
  return awaiting === party;
}

export function AwaitingYou({ request, onRespond, busy, party }: AwaitingYouProps) {
  const [message, setMessage] = useState('');
  const problem = statementProblem(message);
  const canSend = problem === null && !busy;

  return (
    <Panel
      tone="action"
      title={request.kind === 'answer_question' ? 'A question for you' : 'The case is waiting on you'}
      id="dp-awaiting-you"
      meta={`By ${formatLongDate(request.by)}, on the service’s clock. ${party === 'buyer' ? 'You' : 'You, as the seller'}.`}
    >
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <p
          data-testid="dp-awaiting-instruction"
          style={{
            margin: 0,
            padding: `${raw.space.s3} ${raw.space.s4}`,
            background: tokens.surface.raised,
            borderRadius: raw.radius.md,
            fontFamily: raw.type.familyText,
            fontSize: '0.9375rem',
            lineHeight: 1.55,
            color: tokens.text.primary,
          }}
        >
          {request.instruction}
        </p>

        {request.suggestedEvidence !== undefined && request.suggestedEvidence.length > 0 ? (
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
              What would help
            </p>
            <ul style={{ margin: `${raw.space.s1} 0 0`, paddingLeft: '1.1rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
              {request.suggestedEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div style={{ display: 'grid', gap: raw.space.s2 }}>
          <label htmlFor="dp-reply" style={{ fontFamily: raw.type.familyText, fontSize: '0.875rem', fontWeight: 600 }}>
            Your answer
          </label>
          <textarea
            id="dp-reply"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
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
            {message.trim().length} characters.{' '}
            {problem === 'too_short'
              ? `${STATEMENT_LIMITS.minChars - message.trim().length} more and it is worth a reviewer’s time.`
              : problem === 'too_long'
                ? `Over ${STATEMENT_LIMITS.maxChars}. Keep the answer to what was asked.`
                : 'Send it even if you have no new photograph.'}
          </p>
          <Body size="small">{DEGRADE_COPY.body}</Body>
          <div>
            <ActionButton onClick={() => onRespond(message)} disabled={!canSend}>
              {busy ? 'Sending…' : 'Send your answer'}
            </ActionButton>
          </div>
        </div>
      </div>
    </Panel>
  );
}
