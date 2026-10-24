/**
 * What happens after a buyer or seller accepts a proposal — said in the tense that is true.
 *
 * The temptation in this component is the whole reason it gets its own file: to write "Your R420 is on
 * its way" because that is what a happy product does. It is not true. Acceptance raises
 * `REFUND_INITIATED`, which takes the order to `REFUND_PENDING` and moves no money; the ledger books
 * anything at `REFUND_SETTLED`, which is a step the service takes later and which this screen cannot
 * observe or infer. So the copy is built from `booked`, and when `booked` is false the screen says the
 * refund has not happened yet even though that is the worse-sounding sentence.
 *
 * The same rule holds the seller's side: they are told what has not left their account, because a
 * seller who believes a refund cleared will budget against money that is still theirs.
 */

import { raw, tokens } from '@nastech/design-tokens';
import { MoneyText } from '@nastech/design-system';
import type { Money } from '@nastech/api-contracts';
import { formatLongDate } from '../clock.js';
import { Body, Panel } from '../ui.js';

export interface OutcomeAcceptedProps {
  readonly party: 'buyer' | 'seller';
  readonly amount: Money;
  readonly booked: boolean;
  readonly acceptedAt: string;
  /** The service's own next-step text, if it gave one. Never invented here. */
  readonly serviceNote: string | null;
  readonly returnRequired: boolean;
}

export function acceptedLedgerSentence(party: 'buyer' | 'seller', booked: boolean): string {
  if (booked) {
    return party === 'buyer'
      ? 'The ledger has booked the refund against your order. What reaches your account, and when, is your payment provider’s answer rather than ours.'
      : 'The ledger has booked the refund. The commission on this sale is reversed with it, and that is what the seller statement will show.';
  }
  return party === 'buyer'
    ? 'You accepted the proposal. That requested a refund — it has not paid one, and no money has reached you from this screen.'
    : 'You accepted the proposal. A refund has been requested against this order; nothing has been taken from your settlement yet.';
}

export function OutcomeAccepted({ party, amount, booked, acceptedAt, serviceNote, returnRequired }: OutcomeAcceptedProps) {
  return (
    <Panel
      tone={booked ? 'money' : 'scope'}
      title={booked ? 'Refund booked in the ledger' : 'Accepted — requested, not paid'}
      id="dp-outcome-accepted"
      meta={`Accepted on the service’s record at ${formatLongDate(acceptedAt)}.`}
    >
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <p style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: raw.space.s2, fontFamily: raw.type.familyText }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tokens.text.primary }}>
            <MoneyText value={amount} />
          </span>
          <span style={{ fontSize: '0.875rem', color: booked ? raw.color.signalPositive : raw.color.signalCaution }}>
            {booked ? 'booked' : 'not moved'}
          </span>
        </p>

        <Body>{acceptedLedgerSentence(party, booked)}</Body>

        {!booked ? (
          <Body size="small">
            The order page is the place a settled refund appears, and it will only say so when the ledger has
            booked it. If it stays at “requested”, that is the honest state of the money, not a screen that has
            forgotten you.
          </Body>
        ) : null}

        {returnRequired && !booked ? (
          <Body size="small">
            The item also has to come back. Until the service records it as received, this refund stays a
            request whatever else has been accepted.
          </Body>
        ) : null}

        {serviceNote !== null ? (
          <div style={{ borderLeft: `2px solid ${raw.color.ink300}`, paddingLeft: raw.space.s3 }}>
            <Body size="small">The service said: {serviceNote}</Body>
          </div>
        ) : null}

        <Body size="small">
          Accepting does not close your other rights, and it does not mean NasTech found the item to be
          anything other than what the listing said it was.
        </Body>
      </div>
    </Panel>
  );
}
