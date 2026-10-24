/**
 * Ask-the-seller box. The submit handler is injected (transport-shaped) so the component has no
 * opinion about fixtures vs HTTP. Client validation is a *minimum length*, not grammar: a one-word
 * question wastes the seller's time, and the rejection copy says why instead of showing a red
 * outline. The success state is "sent to the seller", which is literally what the queue means —
 * no endpoint today claims the seller read it.
 */

import { useState } from 'react';
import type { QuestionOutcome } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';

export const MIN_QUESTION_LENGTH = 4;

export interface QuestionBoxProps {
  readonly onAsk: (question: string) => Promise<QuestionOutcome>;
  readonly sellerName: string;
}

type Phase = 'idle' | 'sending' | 'queued' | 'rejected' | 'failed';

export function QuestionBox({ onAsk, sellerName }: QuestionBoxProps) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [reason, setReason] = useState('');

  const submit = async () => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_QUESTION_LENGTH) {
      setPhase('rejected');
      setReason('Write a little more so the seller can answer it.');
      return;
    }
    setPhase('sending');
    setReason('');
    try {
      const outcome = await onAsk(trimmed);
      if (outcome.kind === 'queued') {
        setPhase('queued');
        setText('');
      } else {
        setPhase('rejected');
        setReason(outcome.reason);
      }
    } catch {
      setPhase('failed');
    }
  };

  return (
    <section id="ask-the-seller" aria-label="Ask the seller a question" className="item-question" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2 }}>
      <label htmlFor="item-question-input" style={{ fontFamily: raw.type.familyText, fontSize: '0.875rem', fontWeight: 600, color: tokens.text.primary }}>
        Ask {sellerName} a question
      </label>
      <textarea
        id="item-question-input"
        value={text}
        rows={3}
        maxLength={600}
        disabled={phase === 'sending' || phase === 'queued'}
        placeholder="For example: is the timekeeping shown on the case back, or does it need a service?"
        onChange={(e) => setText(e.target.value)}
        style={{
          border: `1px solid ${phase === 'rejected' ? raw.color.signalNegative : raw.color.ink300}`,
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s3}`,
          fontFamily: raw.type.familyText,
          fontSize: '1rem',
          color: tokens.text.primary,
          background: tokens.surface.primary,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: raw.space.s3, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={phase === 'sending' || phase === 'queued'}
          style={{
            background: tokens.action.default,
            color: tokens.text.onInverse,
            border: 'none',
            borderRadius: raw.radius.sm,
            padding: `${raw.space.s2} ${raw.space.s4}`,
            fontFamily: raw.type.familyText,
            fontSize: '0.875rem',
            cursor: phase === 'sending' || phase === 'queued' ? 'default' : 'pointer',
          }}
        >
          {phase === 'sending' ? 'Sending…' : 'Send question'}
        </button>
        {phase === 'queued' ? (
          <span role="status" data-phase="queued" style={{ color: tokens.text.secondary, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
            Sent to the seller. Answers arrive in your NasTech messages.
          </span>
        ) : null}
        {phase === 'rejected' ? (
          <span role="alert" data-phase="rejected" style={{ color: raw.color.signalNegative, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
            {reason}
          </span>
        ) : null}
        {phase === 'failed' ? (
          <span role="alert" data-phase="failed" style={{ color: raw.color.signalNegative, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
            That did not send. Nothing was lost — try again.
          </span>
        ) : null}
      </div>
    </section>
  );
}
