/**
 * The arithmetic of a partial refund, shown before it is accepted.
 *
 * A buyer who is asked to accept R420 back wants to know where the rest went, and the only honest
 * answer is the split itself: what the order was, what comes back, what the seller keeps, what happens
 * to the commission. So the panel prints the ledger's shape rather than a sentence about it, and
 * `refundSplitIsConsistent` is exported so a wrong number in a fixture or in a future service response
 * fails a test instead of quietly shipping an equation that does not add up to the price.
 *
 * Nothing here is a prediction. The amounts come from the outcome the service proposed; this component
 * only checks that they are the same amounts.
 */

import { raw, tokens } from '@nastech/design-tokens';
import type { Money } from '@nastech/api-contracts';
import { money } from '@nastech/api-contracts';
import { MoneyText } from '@nastech/design-system';
import type { OutcomeDto } from '../api/dispute-transport.js';
import { Body, Panel } from '../ui.js';

export interface SplitCheck {
  readonly consistent: boolean;
  readonly discrepancy: Money;
}

/**
 * `refundToBuyer + releaseToSeller` must equal the amount the buyer paid for the item, and the
 * commission reversal must never exceed the commission taken. Both are arithmetic the ledger already
 * guarantees (`Commissions` reverses in full only on a settled refund); a UI that displays a split
 * failing this is displaying a bug, and it should say so rather than draw a table.
 */
export function refundSplitIsConsistent(outcome: OutcomeDto, buyerItemTotal: Money): SplitCheck {
  const sum = outcome.refundToBuyer.cents + outcome.releaseToSeller.cents;
  const discrepancy = money(sum - buyerItemTotal.cents);
  return { consistent: sum === buyerItemTotal.cents, discrepancy };
}

export function commissionReversalIsBounded(outcome: OutcomeDto, commissionTaken: Money | null): boolean {
  if (outcome.commissionReversal === null) return true;
  // With no commission on the read, the bound is unknowable and the panel says nothing rather than
  // assuming the 10 % take rate the pilot runs at.
  if (commissionTaken === null) return true;
  return outcome.commissionReversal.cents <= commissionTaken.cents;
}

export interface PartialRefundProps {
  readonly outcome: OutcomeDto;
  readonly buyerItemTotal: Money;
  readonly commissionTaken: Money | null;
  /** Whether the ledger has booked it. Renders `not yet moved` otherwise, everywhere. */
  readonly booked: boolean;
}

export function PartialRefund({ outcome, buyerItemTotal, commissionTaken, booked }: PartialRefundProps) {
  const check = refundSplitIsConsistent(outcome, buyerItemTotal);
  const bounded = commissionReversalIsBounded(outcome, commissionTaken);

  return (
    <Panel title="How this split works out" id="dp-partial-refund" meta="Amounts exactly as the service proposed them.">
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: raw.type.familyText, fontSize: '0.9375rem' }}>
          <tbody>
            <Line label="You paid for the item" value={buyerItemTotal} booked />
            <Line label="Back to you" value={outcome.refundToBuyer} booked={booked} emphasis />
            <Line label="Kept by the seller" value={outcome.releaseToSeller} booked={booked} />
            {outcome.commissionReversal !== null ? (
              <Line label="Commission taken back from the sale" value={outcome.commissionReversal} booked={booked} />
            ) : null}
          </tbody>
        </table>

        {check.consistent ? null : (
          <Body size="small">
            <strong>These figures do not add up.</strong> The split shown is{' '}
            <MoneyText value={money(Math.abs(check.discrepancy.cents))} /> away from the amount you paid. Do not
            accept it as it stands — this dispute carries that inconsistency in its record and a reviewer has to
            correct it first.
          </Body>
        )}

        {bounded ? null : (
          <Body size="small">
            The commission reversal shown is larger than the commission taken, which the ledger does not do.
            Treated as an error, not as a bonus.
          </Body>
        )}

        <Body size="small">
          {booked
            ? 'The ledger has booked these amounts. They are history now, not a forecast.'
            : 'None of these amounts have moved. Accepting a proposal asks the ledger for a refund; the ledger books it when it books it, and this screen will say which of the two has happened.'}
        </Body>
      </div>
    </Panel>
  );
}

function Line({
  label,
  value,
  booked,
  emphasis = false,
}: {
  label: string;
  value: Money;
  booked: boolean;
  emphasis?: boolean;
}) {
  return (
    <tr>
      <th scope="row" style={{ textAlign: 'left', padding: `${raw.space.s1} 0`, fontWeight: emphasis ? 600 : 400, color: tokens.text.primary }}>
        {label}
      </th>
      <td
        style={{
          textAlign: 'right',
          padding: `${raw.space.s1} 0`,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: emphasis ? 600 : 400,
          color: booked ? tokens.text.primary : raw.color.ink500,
        }}
      >
        <MoneyText value={value} />
      </td>
    </tr>
  );
}
