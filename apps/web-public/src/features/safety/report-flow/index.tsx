import { raw, tokens } from '@nastech/design-tokens';
import type { ReportAck, ReportSubject, SafetyTransport } from '../api/safety-transport.js';
import { defaultSubjectCatalogue, useFlagSubject } from '../flag-context.js';
import { SubjectPicker } from './subject-picker.js';
import { ReasonPicker } from './reason.js';
import { EvidenceStep } from './evidence.js';
import { WhatHappensNext } from './what-happens-next.js';
import { useReport } from './use-report.js';
import { REPORT_QUEUE } from '../api/safety-transport.js';

const STEP_TITLES: Record<string, string> = {
  subject: 'Who or what',
  reason: 'What happened',
  evidence: 'What you can show',
  next: 'Before you send',
  receipt: 'Sent',
};

/** Plain-text progress: “Step 2 of 4”. No tick glyphs — the tree scan bans them, on purpose. */
function Progress({ step }: { step: string }) {
  const order = ['subject', 'reason', 'evidence', 'next', 'receipt'];
  const index = order.indexOf(step);
  return (
    <p
      className="safety-report-progress"
      style={{ fontSize: '0.85rem', color: tokens.text.secondary, margin: `0 0 ${raw.space.s4}` }}
    >
      Step {Math.min(index + 1, 4)} of 4 — {STEP_TITLES[step] ?? ''}
    </p>
  );
}

/**
 * The receipt is its own export so the no-affordance scan can render it directly — receipt copy
 * is where an accidental promise (“we will act”) hides easiest.
 */
export function ReportReceipt({
  ack,
  subjectLabel,
  onReset,
}: {
  readonly ack: ReportAck;
  readonly subjectLabel: string;
  readonly onReset: () => void;
}) {
  return (
    <section
      className="safety-report-receipt"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ marginTop: 0 }}>Report sent — reference {ack.reference}</h2>
      <p>
        Received {new Date(ack.receivedAt).toLocaleString('en-ZA')}. It sits in the human review
        queue, which opens {ack.queueOpensNote.toLowerCase()}. The first-response target is{' '}
        {ack.firstResponseTargetHours} hours inside that window — a target, not a promise, and no
        outcome has been decided yet.
      </p>
      <p>
        The account “{subjectLabel}” can see this report’s reason and attachments. Nothing on this
        receipt means any judgement has been made about them.
      </p>
      <WhatHappensNext />
      <p style={{ fontSize: '0.9rem', color: tokens.text.secondary }}>
        In the meantime: you can <a href="/safety/blocking">mute this seller</a> so their listings
        and messages stop reaching you, and read <a href="/safety/meet-safely">where to meet</a>{' '}
        if a handover is already booked.
      </p>
      <button type="button" onClick={onReset}>Send another report</button>
    </section>
  );
}

export function ReportFlow({
  transport,
  signedIn = false,
  initialSubject,
}: {
  readonly transport: SafetyTransport;
  readonly signedIn?: boolean;
  readonly initialSubject?: ReportSubject;
}) {
  const flagged = useFlagSubject();
  const prefilled = initialSubject ?? flagged ?? null;
  const flow = useReport(transport, signedIn, prefilled);
  const { state, step } = flow;
  const catalogue = defaultSubjectCatalogue();

  if (step === 'receipt' && state.ack) {
    return (
      <ReportReceipt
        ack={state.ack}
        subjectLabel={state.draft.subject?.label ?? prefilled?.label ?? catalogue[0]!.label}
        onReset={flow.reset}
      />
    );
  }

  return (
    <section
      className="safety-report-flow"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ marginTop: 0 }}>Report a listing, a seller, an order or a handover</h2>
      <p style={{ color: tokens.text.secondary, fontSize: '0.9rem' }}>
        No account needed — a guest report just requires one way to reach you. Nobody is removed or
        warned because of a report alone; a person reads it first.
      </p>
      <Progress step={step} />

      {step === 'subject' ? (
        <SubjectPicker
          catalogue={catalogue}
          selected={state.draft.subject}
          prefilled={prefilled}
          onSelect={(subject) => flow.patch({ subject })}
        />
      ) : null}

      {step === 'reason' ? (
        <ReasonPicker
          value={state.draft.reasonId}
          narrative={state.draft.narrative}
          onChange={(reasonId) => flow.patch({ reasonId })}
          onNarrativeChange={(narrative) => flow.patch({ narrative })}
          errors={state.errors}
        />
      ) : null}

      {step === 'evidence' ? (
        <EvidenceStep
          value={state.draft.evidence}
          onChange={(evidence) => flow.patch({ evidence })}
        />
      ) : null}

      {step === 'next' ? (
        <>
          <WhatHappensNext confirming onAcknowledge={flow.acknowledge} />
          {!signedIn ? (
            <div style={{ marginTop: raw.space.s4 }}>
              <label htmlFor="report-contact" style={{ display: 'block', fontWeight: 600 }}>
                Where can the queue reach you? (email or phone)
              </label>
              <input
                id="report-contact"
                value={state.draft.contact}
                onChange={(e) => flow.patch({ contact: e.target.value })}
                style={{
                  marginTop: raw.space.s2,
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: raw.space.s2,
                  border: `1px solid ${raw.color.ink100}`,
                  borderRadius: raw.radius.md,
                }}
              />
            </div>
          ) : null}
          {state.errors.length > 0 ? (
            <ul style={{ color: raw.color.signalNegative, fontSize: '0.85rem' }}>
              {state.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}
          {state.status === 'failed' ? (
            <p
              className="safety-report-fail"
              role="alert"
              style={{ color: raw.color.signalNegative, fontSize: '0.9rem' }}
            >
              The report did not go through ({state.transportError}). Everything you typed is still
              here — try again, or email safety@nastech.co.za with the same text.
            </p>
          ) : null}
        </>
      ) : null}

      <div style={{ display: 'flex', gap: raw.space.s3, marginTop: raw.space.s5 }}>
        {state.stepIndex > 0 ? (
          <button type="button" onClick={flow.back}>Back</button>
        ) : null}
        {step !== 'next' ? (
          <button type="button" onClick={flow.next}>Continue</button>
        ) : (
          <button
            type="button"
            onClick={() => void flow.submit()}
            disabled={state.status === 'submitting'}
          >
            {state.status === 'submitting' ? 'Sending…' : `Send to the review queue (target: ${REPORT_QUEUE.firstResponseTargetHours} h)`}
          </button>
        )}
      </div>
      {/* Errors on steps that show them via their own components (reason) are also valid here. */}
      {step !== 'reason' && step !== 'next' && state.errors.length > 0 ? (
        <ul style={{ color: raw.color.signalNegative, fontSize: '0.85rem' }}>
          {state.errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
