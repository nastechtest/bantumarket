/**
 * The dispute screen. `critical` route class: no scene runtime, no WebGL, no animation library, and a
 * static path that is sufficient rather than apologetic — every flow on this page completes with no GL
 * context at all, because the evidence that decides a dispute is text and photographs.
 *
 * Composition rule for this file: it routes between states and it never speaks for the service. The
 * eligibility refusal, the scope warning, the clock and the outcome wording all come from the component
 * that owns them, and nothing here softens one of them for layout reasons. The order of the intake
 * panels is the order of the reading burden — what you are claiming, then what we can decide about it,
 * then the evidence, then the send.
 */

import { raw, tokens } from '@nastech/design-tokens';
import { Stepper, PolicyLinks } from '@nastech/design-system';
import type { RouteDef } from '../../router.js';
import type { ConditionRecordDto, DisputePrincipal, DisputeService } from './api/dispute-transport.js';
import { FIXTURE_NOTICE } from './api/fixtures.js';
import { useDispute, orderIdFromPathname } from './use-dispute.js';
import type { IntakeStep } from './intake-state.js';
import { verdictForClaims, claimIsOutsidePlatformScope } from './claim-scope.js';
import type { ClaimVerdict } from './claim-scope.js';
import { reasonByCode, reasonLabelOrFallback } from './reasons.js';
import { DRAFT_NOTICE } from './limits.js';
import { formatLongDate } from './clock.js';
import { ReasonPicker } from './intake/reason-picker.js';
import { ClaimSummary } from './intake/claim-summary.js';
import { SeverityPicker, StatementBox } from './intake/statement-box.js';
import { EvidenceUpload } from './intake/evidence-upload.js';
import { EvidenceList } from './intake/evidence-list.js';
import { ReviewBeforeSend } from './intake/review-before-send.js';
import { severityGuidance } from './intake/severity.js';
import { SlaClock } from './timeline/sla-clock.js';
import { TimelineEvents } from './timeline/events.js';
import { AwaitingYou, awaitingIsForParty } from './timeline/awaiting-you.js';
import { OutcomeCard, outcomeStage } from './timeline/outcome-card.js';
import { WhatWeCanDecide } from './rights/what-we-can-decide.js';
import { WhatWeCannot } from './rights/what-we-cannot.js';
import { ExternalRecourse } from './rights/external-recourse.js';
import { OutcomeAccepted } from './resolution/outcome-accepted.js';
import { PartialRefund } from './resolution/partial-refund.js';
import { ReturnInstruction } from './resolution/return-instruction.js';
import { EscalationNote } from './resolution/escalation-note.js';
import { ActionButton, Body, Panel } from './ui.js';
import type { UploadFile } from './intake/upload-machine.js';

const INTAKE_STEPS: readonly { label: string }[] = [
  { label: 'What is wrong' },
  { label: 'Evidence and words' },
  { label: 'Read it back' },
];

/**
 * Which sentence the scope panels print, decided once for the page. A dispute that quotes a captured
 * render gets the contract's disclosure; a listing whose manifest declared a narrower scope gets that
 * one instead, because the buyer is arguing about the picture the listing actually served.
 */
export function verdictForRecord(
  reasonCode: string | null,
  conditionRecord: ConditionRecordDto | null,
): ClaimVerdict {
  const reason = reasonByCode(reasonCode);
  const claims = reason?.claims ?? [];
  const quotesRender = reason?.quotesRender === true && conditionRecord !== null && conditionRecord.claimScope !== 'none';
  return verdictForClaims(claims, { quotesRender });
}

export function intakeStepIndex(step: IntakeStep): number {
  return step === 'reason' ? 0 : step === 'evidence' ? 1 : 2;
}

export interface DisputePageProps {
  readonly route: RouteDef;
  readonly service: DisputeService;
  readonly principal: DisputePrincipal | null;
  readonly orderId?: string;
}

export function DisputePage({ route, service, principal, orderId }: DisputePageProps) {
  const resolvedOrderId =
    orderId ??
    (typeof window === 'undefined' ? null : orderIdFromPathname(window.location.pathname)) ??
    'ord_01';
  const vm = useDispute({ service, principal, orderId: resolvedOrderId });
  const { phase, intake, actions } = vm;
  const verdict = verdictForRecord(intake.reasonCode, phase.kind === 'intake' ? phase.snapshot.conditionRecord : null);
  const outOfScope = verdict.outsideClaims.filter(claimIsOutsidePlatformScope);

  return (
    <article className="dp-root" style={{ display: 'grid', gap: raw.space.s5, padding: `${raw.space.s5} 0 ${raw.space.s7}` }}>
      <header style={{ display: 'grid', gap: raw.space.s2 }}>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: 'clamp(1.75rem, 5vw, 2.4rem)', letterSpacing: '-0.015em' }}>
          {phase.kind === 'tracking' ? 'Your dispute' : 'Open a dispute'}
        </h1>
        <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '1rem', lineHeight: 1.55, maxWidth: '58ch', fontFamily: raw.type.familyText }}>
          A dispute here is a comparison. A reviewer reads the listing, the condition record the seller agreed
          to, and what you send — and decides what that comparison supports. It is not an inspection of the
          item, and this screen will tell you which of the two a given claim needs.
        </p>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: raw.color.ink500 }}>
          Order {resolvedOrderId} · {route.label}
        </p>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: raw.color.signalCaution }} data-testid="dp-fixture-notice">
          {FIXTURE_NOTICE}
        </p>
      </header>

      {vm.model.notice !== null ? (
        <p role="status" style={{ margin: 0, fontSize: '0.875rem', color: tokens.text.primary, fontFamily: raw.type.familyText, padding: raw.space.s3, background: tokens.surface.raised, borderRadius: raw.radius.md }}>
          {vm.model.notice}
        </p>
      ) : null}

      {phase.kind === 'loading' ? (
        <Panel title="Reading the case file">
          <Body size="small">
            Asking the service for the order, the dates on it and the condition record. Nothing on this screen is
            filled in before it answers, because every date on it belongs to the service.
          </Body>
        </Panel>
      ) : null}

      {phase.kind === 'needs_sign_in' ? (
        <Panel title="Sign in to open a dispute" id="dp-sign-in">
          <div style={{ display: 'grid', gap: raw.space.s3 }}>
            <Body>
              A dispute is filed by a named party on a named order, so the screen has to know who is reading it.
              That is not a formality: the two sides of one dispute see opposite meanings of “waiting on you”.
            </Body>
            <div>
              <a className="dp-cta" href="/sign-in" style={{ color: tokens.action.default, fontWeight: 600, fontFamily: raw.type.familyText }}>
                Sign in, then come back to this order
              </a>
            </div>
          </div>
        </Panel>
      ) : null}

      {phase.kind === 'read_failed' ? (
        <Panel tone="scope" title="We could not read this order" id="dp-read-failed">
          <div style={{ display: 'grid', gap: raw.space.s3 }}>
            <Body>{phase.failure.message}</Body>
            <Body size="small">
              Nothing has been filed and nothing has changed. A dispute you did not send is worse than a screen
              that could not load, so this page will not guess at the order to keep itself company.
            </Body>
            <div>
              <ActionButton onClick={actions.reload}>Try reading it again</ActionButton>
            </div>
          </div>
        </Panel>
      ) : null}

      {phase.kind === 'ineligible' ? (
        <>
          <Panel tone="scope" title={phase.verdict.headline} id="dp-ineligible">
            <div style={{ display: 'grid', gap: raw.space.s3 }}>
              <Body>{phase.verdict.detail}</Body>
              {phase.verdict.governingDateIso !== null ? (
                <p style={{ margin: 0, fontFamily: raw.type.familyText, fontSize: '0.9375rem' }}>
                  The date that decides it: <strong>{formatLongDate(phase.verdict.governingDateIso)}</strong>
                  {phase.verdict.governingDateLabel !== null ? ` — ${phase.verdict.governingDateLabel.toLowerCase()}.` : '.'}
                </p>
              ) : null}
              <Body size="small">{phase.verdict.nextStep}</Body>
            </div>
          </Panel>
          <WhatWeCanDecide />
          <ExternalRecourse />
        </>
      ) : null}

      {phase.kind === 'intake' ? (
        <div style={{ display: 'grid', gap: raw.space.s4 }}>
          <Stepper steps={INTAKE_STEPS} currentIndex={intakeStepIndex(intake.step)} />

          {intake.draftFoundAt !== null ? (
            <Panel tone="action" title="A draft of this is on this device" id="dp-draft">
              <div style={{ display: 'grid', gap: raw.space.s2 }}>
                <Body size="small">
                  Last written {intake.draftFoundAt} — your device’s clock, not ours. {DRAFT_NOTICE}
                </Body>
                <div style={{ display: 'flex', gap: raw.space.s2, flexWrap: 'wrap' }}>
                  <ActionButton onClick={actions.restoreDraft}>Take the draft back</ActionButton>
                  <ActionButton emphasis="quiet" onClick={actions.discardDraft}>
                    Delete it and start again
                  </ActionButton>
                </div>
              </div>
            </Panel>
          ) : null}

          {phase.sendUnconfirmed !== null ? (
            <Panel tone="scope" title="We do not know whether that reached us" id="dp-send-unconfirmed">
              <div style={{ display: 'grid', gap: raw.space.s2 }}>
                <Body>{phase.sendUnconfirmed.message}</Body>
                <Body size="small">
                  Nothing has been marked as filed, and no dispute is shown to you as open. Pressing send again
                  uses the same key, so if the first one did arrive you will not get two disputes about one watch.
                </Body>
                <div>
                  <ActionButton onClick={actions.send} disabled={vm.busy || !vm.gate.ok}>
                    {vm.busy ? 'Checking…' : 'Send it again'}
                  </ActionButton>
                </div>
              </div>
            </Panel>
          ) : null}

          <ReasonPicker selected={intake.reasonCode} onSelect={actions.pickReason} />

          <ClaimSummary
            reason={reasonByCode(intake.reasonCode)}
            verdict={verdict}
            conditionRecord={phase.snapshot.conditionRecord}
            statement={intake.statement}
          />

          {intake.reasonCode !== null ? (
            <div style={{ display: 'grid', gap: raw.space.s3 }}>
              <SeverityPicker
                value={intake.severity}
                onChange={(value) => {
                  actions.pickSeverity(value);
                  actions.goStep('evidence');
                }}
              />
              <StatementBox
                value={intake.statement}
                onChange={actions.setStatement}
                guidance={reasonByCode(intake.reasonCode)?.whatToDescribe ?? ''}
                degrading={Object.values(intake.uploads).some((u) => u.shouldDegrade)}
              />
              <EvidenceUpload
                attachedCount={vm.attachedEvidence.length}
                onPick={(files: readonly UploadFile[]) => files.forEach(actions.addFile)}
                onDegrade={() => actions.goStep('evidence')}
              />
              <Panel title="Files for this dispute" id="dp-files" meta="What the case file holds, as the service last told us.">
                <EvidenceList uploads={intake.uploads} attached={vm.attachedEvidence} onRetry={actions.retryUpload} onRemove={actions.removeUpload} />
              </Panel>
            </div>
          ) : null}

          {outOfScope.length > 0 ? (
            <div id="dp-intake-cannot">
              <WhatWeCannot verdict={verdict} compact />
            </div>
          ) : (
            <WhatWeCanDecide />
          )}

          <ReviewBeforeSend
            reason={reasonByCode(intake.reasonCode)}
            severityLabel={severityGuidance(intake.severity)?.label ?? null}
            statement={intake.statement}
            uploads={intake.uploads}
            attachedEvidence={vm.attachedEvidence}
            verdict={verdict}
            eligibility={phase.verdict}
            gate={vm.gate}
            acknowledged={intake.readRightsAcknowledged}
            onAcknowledge={actions.acknowledgeRights}
            onSend={actions.send}
            onBack={() => actions.goStep('evidence')}
            busy={vm.busy}
          />

          <WhatWeCanDecide />
          <ExternalRecourse verdict={verdict} />

          {intake.step !== 'reason' ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ActionButton emphasis="quiet" onClick={() => actions.goStep(intake.step === 'review' ? 'evidence' : 'reason')}>
                Back a step
              </ActionButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase.kind === 'tracking' ? (
        <div style={{ display: 'grid', gap: raw.space.s4 }}>
          <SlaClock sla={phase.dispute.sla} />

          {phase.dispute.awaitingYou !== undefined && awaitingIsForParty(phase.dispute.sla.awaiting, phase.dispute.openedBy) ? (
            <AwaitingYou request={phase.dispute.awaitingYou} onRespond={actions.respond} busy={vm.busy} party={phase.dispute.openedBy} />
          ) : null}

          {phase.dispute.outcome !== undefined ? (
            <>
              <OutcomeCard
                outcome={phase.dispute.outcome}
                party={phase.dispute.openedBy}
                stage={outcomeStage(phase.dispute.outcome, phase.dispute.outcome.acceptedBy)}
                onAccept={actions.acceptOutcome}
                onDecline={actions.declineOutcome}
                busy={vm.busy}
                scopeNote={
                  verdictForRecord(phase.dispute.reasonCode, phase.snapshot.conditionRecord).cannotVerifyLines[0] ?? null
                }
              />
              <PartialRefund
                outcome={phase.dispute.outcome}
                buyerItemTotal={phase.snapshot.buyerTotal}
                commissionTaken={phase.snapshot.commissionTaken ?? null}
                booked={phase.dispute.outcome.booked}
              />
            </>
          ) : null}

          {phase.dispute.state === 'outcome_accepted' && phase.dispute.outcome !== undefined ? (
            <OutcomeAccepted
              party={phase.dispute.openedBy}
              amount={phase.dispute.outcome.refundToBuyer}
              booked={phase.dispute.outcome.booked}
              acceptedAt={phase.dispute.outcome.proposedAt}
              serviceNote={phase.dispute.awaitingYou?.instruction ?? null}
              returnRequired={phase.dispute.outcome.returnRequired}
            />
          ) : null}

          {phase.dispute.outcome?.returnRequired === true || phase.dispute.returnInstruction !== undefined ? (
            <ReturnInstruction
              instruction={phase.dispute.returnInstruction ?? null}
              onRequest={actions.requestReturn}
              onConfirmReceived={actions.confirmReturnReceived}
              busy={vm.busy}
              party={phase.dispute.openedBy}
            />
          ) : null}

          <TimelineEvents events={phase.dispute.timeline} party={phase.dispute.openedBy} />

          <Panel title="What this dispute is about" id="dp-tracking-claim">
            <div style={{ display: 'grid', gap: raw.space.s2 }}>
              <Body>
                <strong>{reasonLabelOrFallback(phase.dispute.reasonCode)}</strong>
              </Body>
              <Body size="small">{severityGuidance(phase.dispute.severity)?.whatItMeans}</Body>
              <p style={{ margin: 0, padding: raw.space.s3, background: tokens.surface.raised, borderRadius: raw.radius.md, fontFamily: raw.type.familyText, fontSize: '0.9375rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                {phase.dispute.statement}
              </p>
              <EvidenceList uploads={{}} attached={phase.dispute.evidence} />
            </div>
          </Panel>

          <WhatWeCannot verdict={verdictForRecord(phase.dispute.reasonCode, phase.snapshot.conditionRecord)} />

          {phase.dispute.state !== 'withdrawn' ? (
            <EscalationNote
              verdict={verdictForRecord(phase.dispute.reasonCode, phase.snapshot.conditionRecord)}
              escalation={null}
              onEscalate={actions.escalate}
              busy={vm.busy}
            />
          ) : null}
        </div>
      ) : null}

      <footer style={{ borderTop: `1px solid ${raw.color.ink100}`, paddingTop: raw.space.s4 }}>
        <PolicyLinks />
      </footer>
    </article>
  );
}
