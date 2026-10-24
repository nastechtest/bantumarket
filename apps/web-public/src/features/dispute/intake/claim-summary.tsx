/**
 * The claim, in the platform's own words, next to the words it is being compared against.
 *
 * This panel is the dispute process's actual unit of work: a reviewer decides whether the buyer's
 * account contradicts the record the seller agreed to. So the record is quoted here verbatim from
 * the condition captions (`@nastech/api-contracts` calls the caption's `disclosureId` "the disclosure
 * record the dispute process reads"), the scope sentence is quoted verbatim from the contract, and
 * nothing in between is paraphrased. A summary that tidied either of them up would be editing the
 * evidence.
 *
 * When the reason is outside what the platform can decide, that line is printed here as well, at the
 * top rather than the bottom. The alternative is a buyer who reads the scope warning after they have
 * already agreed with the summary.
 */

import { raw, tokens } from '@nastech/design-tokens';
import type { ClaimVerdict } from '../claim-scope.js';
import { CLAIM_KIND_LABELS } from '../claim-scope.js';
import type { ConditionRecordDto } from '../api/dispute-transport.js';
import type { DisputeReason } from '../reasons.js';
import { Body, Panel } from '../ui.js';

export interface ClaimSummaryProps {
  readonly reason: DisputeReason | null;
  readonly verdict: ClaimVerdict;
  readonly conditionRecord: ConditionRecordDto | null;
  readonly statement: string;
}

export function ClaimSummary({ reason, verdict, conditionRecord, statement }: ClaimSummaryProps) {
  return (
    <Panel title="What you are saying" id="dp-claim" tone={verdict.fullyWithinScope ? 'neutral' : 'scope'}>
      {reason === null ? (
        <Body size="small">Choose a reason and this will read your own account back to you before anything is sent.</Body>
      ) : (
        <div style={{ display: 'grid', gap: raw.space.s3 }}>
          <dl style={{ margin: 0, display: 'grid', gap: raw.space.s2 }}>
            <div>
              <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
                Reason
              </dt>
              <dd style={{ margin: 0, fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary }}>
                {reason.label}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
                What you are claiming
              </dt>
              <dd style={{ margin: 0, fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary }}>
                {reason.claims.map((kind) => CLAIM_KIND_LABELS[kind]).join(' · ')}
              </dd>
            </div>
          </dl>

          {statement.trim().length > 0 ? (
            <blockquote
              style={{
                margin: 0,
                padding: `${raw.space.s2} ${raw.space.s3}`,
                borderLeft: `2px solid ${raw.color.ink300}`,
                background: tokens.surface.raised,
                fontFamily: raw.type.familyText,
                fontSize: '0.9375rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {statement}
            </blockquote>
          ) : null}

          {!verdict.fullyWithinScope ? (
            <div
              data-testid="dp-out-of-scope"
              style={{
                border: `1px solid ${raw.color.signalCaution}`,
                borderRadius: raw.radius.md,
                padding: raw.space.s3,
                background: tokens.surface.raised,
              }}
            >
              <p style={{ margin: 0, fontWeight: 600, fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: raw.color.signalCaution }}>
                What NasTech cannot decide about this
              </p>
              <ul style={{ margin: `${raw.space.s2} 0 0`, paddingLeft: '1.1rem', fontSize: '0.875rem', lineHeight: 1.55 }}>
                {verdict.cannotVerifyLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {verdict.renderDisclosure !== null ? (
            <div data-testid="dp-render-scope">
              <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
                The scope of the picture you are pointing at, in the contract’s own words
              </p>
              <p style={{ margin: `${raw.space.s1} 0 0`, fontFamily: raw.type.familyText, fontSize: '0.875rem', lineHeight: 1.5 }}>
                {verdict.renderDisclosure}
              </p>
            </div>
          ) : null}

          {conditionRecord !== null && conditionRecord.captions.length > 0 ? (
            <div>
              <p style={{ margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
                The condition record the seller agreed to ({conditionRecord.title})
              </p>
              <ul style={{ margin: `${raw.space.s2} 0 0`, padding: 0, listStyle: 'none', display: 'grid', gap: raw.space.s2 }}>
                {conditionRecord.captions.map((caption) => (
                  <li
                    key={caption.disclosureId}
                    style={{
                      fontSize: '0.875rem',
                      lineHeight: 1.5,
                      fontFamily: raw.type.familyText,
                      padding: `${raw.space.s2} ${raw.space.s3}`,
                      border: `1px dashed ${raw.color.ink100}`,
                      borderRadius: raw.radius.sm,
                    }}
                  >
                    {caption.disclosureText}
                    <span style={{ color: tokens.text.disabled }}> — {caption.disclosureId}, {caption.severity}</span>
                  </li>
                ))}
              </ul>
              <Body size="small">
                A reviewer compares your words and your photographs against these sentences. If what you
                describe is already written here, tell us why yours is different — that is the part they
                cannot work out on their own.
              </Body>
            </div>
          ) : (
            <Body size="small">
              This listing has no condition record on file, so there is nothing written for a reviewer to
              compare your photographs against. Say as precisely as you can what the listing showed.
            </Body>
          )}
        </div>
      )}
    </Panel>
  );
}
