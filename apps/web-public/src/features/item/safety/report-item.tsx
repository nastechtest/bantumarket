/**
 * Report-this-listing. Deliberately modest: a closed vocabulary of reasons (from
 * `REPORT_REASONS` — nothing outside it can be submitted), a note that a report starts a human
 * review and is not a takedown, and — important for the pilot's honesty posture — a pointer that
 * *buyer-seller money trouble* belongs to a dispute, not here. Reporting an item is about the
 * item; disputing an order is about the money.
 */

import { useState } from 'react';
import type { ReportOutcome, ReportReason } from '../api/item-transport.js';
import { REPORT_REASONS } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';

export interface ReportItemProps {
  readonly onReport: (reason: ReportReason) => Promise<ReportOutcome>;
}

type Phase = 'idle' | 'sending' | 'received' | 'rejected' | 'failed';

export function ReportItem({ onReport }: { onReport: (reason: ReportReason) => Promise<ReportOutcome> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('misleading_condition');
  const [phase, setPhase] = useState<Phase>('idle');

  const submit = async () => {
    setPhase('sending');
    try {
      const outcome = await onReport(reason);
      setPhase(outcome.kind === 'received' ? 'received' : 'rejected');
    } catch {
      setPhase('failed');
    }
  };

  if (phase === 'received') {
    return (
      <p role="status" data-report-state="received" style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
        Report received. A person on the safety team reads it; the listing stays up while it is
        reviewed.
      </p>
    );
  }

  return (
    <div className="item-report" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, fontFamily: raw.type.familyText }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: tokens.text.secondary, fontSize: '0.8125rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
      >
        Report this listing
      </button>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, padding: raw.space.s3, border: `1px solid ${raw.color.ink100}`, borderRadius: raw.radius.md }}>
          <label htmlFor="report-reason" style={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.text.primary }}>
            What is wrong with it?
          </label>
          <select
            id="report-reason"
            value={reason}
            disabled={phase === 'sending'}
            onChange={(e) => {
              const next = e.target.value as ReportReason;
              setReason(next);
            }}
            style={{ padding: raw.space.s2, borderRadius: raw.radius.sm, border: `1px solid ${raw.color.ink300}`, fontFamily: raw.type.familyText, fontSize: '0.875rem' }}
          >
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: raw.space.s2, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={phase === 'sending'}
              onClick={() => void submit()}
              style={{ background: 'transparent', color: raw.color.signalNegative, border: `1px solid ${raw.color.signalNegative}`, borderRadius: raw.radius.sm, padding: `${raw.space.s1} ${raw.space.s3}`, fontSize: '0.8125rem', cursor: 'pointer' }}
            >
              {phase === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            {phase === 'rejected' ? (
              <span role="alert" style={{ color: raw.color.signalNegative, fontSize: '0.8125rem' }}>
                We could not accept that report. Try again.
              </span>
            ) : null}
            {phase === 'failed' ? (
              <span role="alert" style={{ color: raw.color.signalNegative, fontSize: '0.8125rem' }}>
                Nothing reached us — your report was not filed.
              </span>
            ) : null}
          </div>
          <p style={{ margin: 0, color: tokens.text.disabled, fontSize: '0.75rem' }}>
            Reporting is about the listing. A payment problem after an order is a dispute, filed
            from your orders page, not here.
          </p>
        </div>
      ) : null}
    </div>
  );
}
