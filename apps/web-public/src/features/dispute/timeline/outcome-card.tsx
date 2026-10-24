/**
 * The proposal card. The one thing it must never do is read like a decision.
 *
 * `outcome_offered` means a reviewer has put a number on the table and the parties have not agreed to
 * it. `booked` means the ledger has applied a money-bearing event. Those are four states apart, and
 * the header wording separates them because a seller who reads "Refund R420" in a heading believes
 * money has moved — and it has not, since `REFUND_INITIATED` is a request and only `REFUND_SETTLED` is
 * a movement.
 *
 * The accept/decline controls say what each one does to the ledger in the same sentence, and the card
 * keeps the scope line attached to the outcome: a partial refund on a claim we cannot verify is not a
 * finding that the claim is true.
 */

import { raw, tokens } from '@nastech/design-tokens';
import { MoneyText } from '@nastech/design-system';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';
import type { OutcomeDto } from '../api/dispute-transport.js';
import { formatLongDate } from '../clock.js';
import { ActionButton, Body, Panel } from '../ui.js';

export type OutcomeStage = 'proposed' | 'accepted_unbooked' | 'booked' | 'declined';

/** Pure, and the reason the card can be tested without a DOM: the stage is what all the wording keys on. */
export function outcomeStage(outcome: OutcomeDto, acceptedBy?: 'buyer' | 'seller'): OutcomeStage {
  if (outcome.booked) return 'booked';
  if (acceptedBy !== undefined) return 'accepted_unbooked';
  return 'proposed';
}

const STAGE_HEADLINE: Record<OutcomeStage, string> = {
  proposed: 'A proposal, not a decision',
  accepted_unbooked: 'Accepted by you — nothing has been paid yet',
  booked: 'Booked in the ledger',
  declined: 'Declined, back with a reviewer',
};

export interface OutcomeCardProps {
  readonly outcome: OutcomeDto;
  readonly party: 'buyer' | 'seller';
  readonly stage: OutcomeStage;
  readonly onAccept: (id: string) => void;
  readonly onDecline: (id: string) => void;
  readonly busy: boolean;
  /** The scope line from `../claim-scope.ts`, quoted where the outcome touches a claim we cannot test. */
  readonly scopeNote: string | null;
}

export function OutcomeCard({ outcome, party, stage, onAccept, onDecline, busy, scopeNote }: OutcomeCardProps) {
  const canRespond = stage === 'proposed';
  return (
    <Panel tone="money" title={STAGE_HEADLINE[stage]} id="dp-outcome" meta={`Proposed ${formatLongDate(outcome.proposedAt)}`}>
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <p
          data-testid="dp-outcome-explanation"
          style={{
            margin: 0,
            padding: raw.space.s3,
            background: tokens.surface.raised,
            borderRadius: raw.radius.md,
            fontFamily: raw.type.familyText,
            fontSize: '0.9375rem',
            lineHeight: 1.55,
          }}
        >
          {outcome.explanation}
        </p>

        <dl style={{ margin: 0, display: 'grid', gap: raw.space.s2 }}>
          <MoneyRow label="Back to you" value={outcome.refundToBuyer} stage={stage} />
          <MoneyRow label="Released to the seller" value={outcome.releaseToSeller} stage={stage} />
          {outcome.commissionReversal !== null ? (
            <MoneyRow label="Commission reversed" value={outcome.commissionReversal} stage={stage} />
          ) : (
            <div>
              <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>
                Commission
              </dt>
              <dd style={{ margin: `${raw.space.s1} 0 0`, fontSize: '0.9375rem' }}>Untouched by this proposal.</dd>
            </div>
          )}
        </dl>

        {outcome.returnRequired ? (
          <Body size="small">
            The item has to come back before anything is settled. The return steps are below, and until the
            service records the item as received, nothing here should read as done.
          </Body>
        ) : null}

        {scopeNote !== null ? (
          <Body size="small">
            <strong>What this outcome is not.</strong> {scopeNote} A refund decided here is a decision about what
            the listing said: “{CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition}” — it is not a finding
            about the movement, the seals or the provenance.
          </Body>
        ) : null}

        {outcome.expiresAt !== undefined ? (
          <Body size="small">
            The service records this offer as open until {formatLongDate(outcome.expiresAt)}. If nobody answers,
            it goes back to a reviewer; it does not become accepted on a timeout, and this screen will not tell
            you otherwise.
          </Body>
        ) : null}

        {canRespond ? (
          <div style={{ display: 'flex', gap: raw.space.s3, flexWrap: 'wrap' }}>
            <ActionButton onClick={() => onAccept(outcome.id)} disabled={busy}>
              Accept the proposal
            </ActionButton>
            <ActionButton emphasis="secondary" onClick={() => onDecline(outcome.id)} disabled={busy}>
              Decline and ask for a second look
            </ActionButton>
          </div>
        ) : null}

        {stage === 'accepted_unbooked' ? (
          <Body size="small">
            You accepted. That raised a refund request with the ledger — it has not taken money from anybody
            and it has not paid you. The order page is where a settled refund appears, and it will say so only
            when the ledger books it.
          </Body>
        ) : null}

        {stage === 'booked' ? (
          <Body size="small">The ledger has booked this. Nothing on this screen can change it.</Body>
        ) : null}
      </div>
    </Panel>
  );
}

function MoneyRow({ label, value, stage }: { label: string; value: Money; stage: OutcomeStage }) {
  return (
    <div>
      <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>{label}</dt>
      <dd style={{ margin: `${raw.space.s1} 0 0`, display: 'flex', gap: raw.space.s2, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: raw.type.familyText, fontSize: '1.0625rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          <MoneyText value={value} />
        </span>
        <span style={{ fontSize: '0.8125rem', color: stage === 'booked' ? raw.color.signalPositive : raw.color.signalCaution }}>
          {stage === 'booked' ? 'settled' : 'not yet moved'}
        </span>
      </dd>
    </div>
  );
}
