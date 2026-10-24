import { raw, tokens } from '@nastech/design-tokens';
import { REPORT_QUEUE } from '../api/safety-transport.js';

/**
 * The honesty screen. It appears twice — once as a step before submitting, once in the receipt —
 * because both moments matter: before, so nobody files a report believing action is automatic;
 * after, so nobody refreshes expecting one by Friday.
 *
 * What is stated: a human queue, a service target (a target), the range of possible outcomes
 * including “no action”, and that the person reported sees the report's stated reason and
 * attachments. Nothing here may promise an outcome, in wording or in styling.
 */

export const OUTCOME_RANGE: readonly string[] = [
  'No action, because what you described does not break the rules — being reported has no effect on an account by itself.',
  'A question back to you: the queue may need one more detail before anyone can judge.',
  'The listing is hidden or removed under the prohibited-items or pricing policy.',
  'The seller is warned, restricted from new listings, or their account is paused — always after a human has looked.',
  'If an order is mid-handover, the handover can be stopped and the held money returned to the buyer (the ledger marks the refund only once it has actually settled).',
  'If what you describe looks like a crime, the record can go to SAPS; you will also be free to open your own case at any police station.',
];

export function WhatHappensNext({ confirming, onAcknowledge }: {
  readonly confirming?: boolean;
  readonly onAcknowledge?: (key: 'readQueue' | 'readSubjectSees', checked: boolean) => void;
}) {
  return (
    <section
      className="safety-what-happens-next"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>What happens next, honestly</h3>
      <p style={{ margin: `0 0 ${raw.space.s3}` }}>
        Your report goes to a <strong>human review queue</strong> that opens{' '}
        {REPORT_QUEUE.openingHours.toLowerCase()}. The queue’s service target for a first response
        is <strong>within {REPORT_QUEUE.firstResponseTargetHours} hours</strong> of that window.
        A target is what we aim at, not what we promise: busy weeks, weekends and public holidays
        exist, and no outcome is decided when you press submit.
      </p>
      <p style={{ margin: `0 0 ${raw.space.s2}`, fontWeight: 600 }}>Possible outcomes, including the boring ones:</p>
      <ul style={{ margin: `0 0 ${raw.space.s4}`, paddingInlineStart: '1.2rem' }}>
        {OUTCOME_RANGE.map((o) => (
          <li key={o} style={{ marginBottom: raw.space.s2, fontSize: '0.92rem' }}>
            {o}
          </li>
        ))}
      </ul>
      <p
        style={{
          margin: `0 0 ${raw.space.s4}`,
          padding: raw.space.s3,
          background: raw.color.paperWarm,
          borderRadius: raw.radius.md,
          fontSize: '0.92rem',
        }}
      >
        <strong>The person you report sees the report.</strong> They are shown the reason you picked,
        the messages or notes you attach, and the date. Your contact details are not handed to them;
        if the report concerns your own order they may work out it came from you — that is normal and
        it is also why this page never says the process is anonymous. A report is a request for a
        human look, not a weapon, and the other side being able to see it is part of the fairness.
      </p>
      <p style={{ margin: 0, fontSize: '0.85rem', color: tokens.text.secondary }}>
        Records of reports are kept for {Math.round(REPORT_QUEUE.retentionMonths / 12)} years to
        match fraud patterns across accounts, then restricted; you can ask us for a copy of your own
        report at any time (see the POPIA note).
      </p>
      {confirming && onAcknowledge ? (
        <div style={{ marginTop: raw.space.s4 }}>
          <label style={{ display: 'block', marginBottom: raw.space.s2, cursor: 'pointer' }}>
            <span style={{ display: 'flex', gap: raw.space.s2, alignItems: 'baseline' }}>
              <input
                type="checkbox"
                data-testid="ack-queue"
                onChange={(e) => onAcknowledge('readQueue', e.target.checked)}
              />
              <span style={{ fontSize: '0.92rem' }}>
                I understand a human reads this later, there is only a response target, and no
                outcome is promised.
              </span>
            </span>
          </label>
          <label style={{ display: 'block', cursor: 'pointer' }}>
            <span style={{ display: 'flex', gap: raw.space.s2, alignItems: 'baseline' }}>
              <input
                type="checkbox"
                data-testid="ack-visible"
                onChange={(e) => onAcknowledge('readSubjectSees', e.target.checked)}
              />
              <span style={{ fontSize: '0.92rem' }}>
                I understand the person I am reporting will see my reason and what I attach.
              </span>
            </span>
          </label>
        </div>
      ) : null}
    </section>
  );
}
