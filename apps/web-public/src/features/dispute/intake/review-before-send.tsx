/**
 * The last screen before a dispute exists.
 *
 * Its job is to make the buyer see what they are about to send, including the part they would rather
 * not have read: what the platform cannot decide. The acknowledgement below the read-back is therefore
 * not a terms-of-service ritual — it is the only place the intake asks the buyer to confirm they
 * understood the scope before their account becomes a case file. It is required exactly when the claim
 * needs it (`requiresRightsAck` in `../send-gate.ts`): a purely cosmetic claim does not need a
 * signature on a boundary that is not in play, and pretending otherwise trains people to tick things.
 *
 * No wording here promises an outcome, a date, or a refund. The deadline it shows is the service's own
 * window from the eligibility verdict, and it is labelled as a window for *filing*, not for deciding.
 */

import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import type { ClaimVerdict } from '../claim-scope.js';
import { CLAIM_KIND_LABELS } from '../claim-scope.js';
import type { DisputeReason } from '../reasons.js';
import type { EvidenceDto } from '../api/dispute-transport.js';
import type { EligibilityVerdict } from '../eligibility.js';
import type { SendGate } from '../send-gate.js';
import type { UploadState } from './upload-machine.js';
import { formatTimestamp } from '../clock.js';
import { DRAFT_NOTICE, EVIDENCE_LIMITS, STATEMENT_LIMITS } from '../limits.js';
import { ActionButton, Body, Panel } from '../ui.js';
import { WhatWeCannot } from '../rights/what-we-cannot.js';

export interface ReviewBeforeSendProps {
  readonly reason: DisputeReason | null;
  readonly severityLabel: string | null;
  readonly statement: string;
  readonly uploads: Readonly<Record<string, UploadState>>;
  readonly attachedEvidence: readonly EvidenceDto[];
  readonly verdict: ClaimVerdict;
  readonly eligibility: EligibilityVerdict;
  readonly gate: SendGate;
  readonly acknowledged: boolean;
  readonly onAcknowledge: (value: boolean) => void;
  readonly onSend: () => void;
  readonly onBack: () => void;
  readonly busy: boolean;
}

export function reviewChecklist(uploads: Readonly<Record<string, UploadState>>): {
  readonly attached: number;
  readonly pending: number;
  readonly refused: number;
} {
  let attached = 0;
  let pending = 0;
  let refused = 0;
  for (const state of Object.values(uploads)) {
    if (state.phase === 'attached') attached += 1;
    else if (state.phase === 'rejected') refused += 1;
    else pending += 1;
  }
  return { attached, pending, refused };
}

export function ReviewBeforeSend(props: ReviewBeforeSendProps) {
  const counts = reviewChecklist(props.uploads);
  const ackRequired = props.reason !== null && !props.verdict.fullyWithinScope;

  return (
    <div id="dp-review" style={{ display: 'grid', gap: raw.space.s4 }}>
      <Panel title="Read it back before you send" meta="Nothing has been sent. Nothing will be sent until you press the button at the bottom.">
        <dl style={{ margin: 0, display: 'grid', gap: raw.space.s3 }}>
          <ReviewRow term="What is wrong">
            {props.reason !== null ? props.reason.label : 'Not chosen yet.'}
          </ReviewRow>
          <ReviewRow term="How bad you say it is">{props.severityLabel ?? 'Not chosen yet.'}</ReviewRow>
          <ReviewRow term="What you are claiming">
            {props.reason !== null ? props.reason.claims.map((k) => CLAIM_KIND_LABELS[k]).join(' · ') : '—'}
          </ReviewRow>
          <ReviewRow term="Your account">
            <span style={{ whiteSpace: 'pre-wrap' }}>{props.statement.trim().length > 0 ? props.statement : 'Nothing written yet.'}</span>
          </ReviewRow>
          <ReviewRow term="Files">
            {counts.attached} in the case file
            {counts.pending > 0 ? `, ${counts.pending} still sending` : ''}
            {counts.refused > 0 ? `, ${counts.refused} we could not take` : ''}
          </ReviewRow>
          {props.eligibility.governingDateLabel !== null ? (
            <ReviewRow term="Filing window">{props.eligibility.governingDateLabel}</ReviewRow>
          ) : null}
        </dl>

        {counts.pending > 0 ? (
          <Body size="small">
            {counts.pending} file {counts.pending === 1 ? 'is' : 'are'} still reaching us. You can send now and
            they will join the dispute as they land — a dispute is not held up waiting for a photograph.
          </Body>
        ) : null}

        {props.attachedEvidence.length > EVIDENCE_LIMITS.maxFilesPerDispute ? (
          <Body size="small">Only the first {EVIDENCE_LIMITS.maxFilesPerDispute} files fit in a case file.</Body>
        ) : null}
      </Panel>

      <WhatWeCannot verdict={props.verdict} compact />

      {ackRequired ? (
        <div
          style={{
            border: `1px solid ${raw.color.signalCaution}`,
            borderRadius: raw.radius.md,
            padding: raw.space.s4,
            background: tokens.surface.raised,
            display: 'grid',
            gap: raw.space.s2,
          }}
        >
          <label htmlFor="dp-ack" style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start', fontFamily: raw.type.familyText, fontSize: '0.9375rem' }}>
            <input
              id="dp-ack"
              type="checkbox"
              checked={props.acknowledged}
              onChange={(event) => props.onAcknowledge(event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I have read that NasTech cannot verify{' '}
              {props.verdict.outsideClaims.map((k) => CLAIM_KIND_LABELS[k].toLowerCase()).join(', ')} — and that a
              photograph or a 3D model of this item shows only what{' '}
              <em>{CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition}</em> says it shows.
            </span>
          </label>
          <Body size="small">
            Ticking this does not weaken your dispute and does not strengthen it. It is the record that the
            boundary was explained before you filed, which is the thing a reviewer would otherwise have to
            establish after the fact.
          </Body>
        </div>
      ) : (
        <Body size="small">
          Your claim is the kind a reviewer can decide by comparing the listing, the condition record and your
          photographs, so nothing needs to be acknowledged here.
        </Body>
      )}

      {props.gate.reason !== null ? (
        <p id="dp-send-block" role="status" style={{ margin: 0, fontSize: '0.875rem', color: raw.color.signalCaution, fontFamily: raw.type.familyText }}>
          {props.gate.reason}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: raw.space.s3, flexWrap: 'wrap', alignItems: 'center' }}>
        <ActionButton onClick={props.onSend} disabled={!props.gate.ok || props.busy} ariaDescribedBy={props.gate.reason !== null ? 'dp-send-block' : undefined}>
          {props.busy ? 'Sending…' : 'Send this dispute'}
        </ActionButton>
        <ActionButton emphasis="secondary" onClick={props.onBack} disabled={props.busy}>
          Back to editing
        </ActionButton>
      </div>

      <Body size="small">
        {DRAFT_NOTICE}{' '}
        {props.statement.trim().length < STATEMENT_LIMITS.minChars ? 'It is also still too short to send.' : ''}
      </Body>

      {props.eligibility.governingDateIso !== null ? (
        <Body size="small">
          If you send now, the case file is stamped with the service’s clock, read at{' '}
          {formatTimestamp(props.eligibility.governingDateIso)}. A reviewer’s answer is not a promise and has no
          date on it here, because we do not hold that date.
        </Body>
      ) : null}
    </div>
  );
}

function ReviewRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
        {term}
      </dt>
      <dd style={{ margin: `${raw.space.s1} 0 0`, fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary, lineHeight: 1.5 }}>
        {children}
      </dd>
    </div>
  );
}
