import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { formatCents } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import {
  CAPTURE_BREAK_EVEN_CENTS,
  CAPTURE_COST_CENTS,
  EXAMPLE_PAYOUT_CENTS,
  EXAMPLE_SALE_PRICE_CENTS,
  EXAMPLE_SUCCESS_FEE_CENTS,
  LISTING_FEE_BASIS_POINTS,
  SUCCESS_FEE_BASIS_POINTS,
} from '../../lib/fees.js';

/**
 * Selling landing page for the buyer app. It explains the two numbers a seller actually cares
 * about — the R270 capture run and the price at which that run pays for itself — and refuses to
 * turn the capture into a claim about authenticity, movement or value.
 */
export function SellLanding() {
  const successRate = SUCCESS_FEE_BASIS_POINTS / 100;
  return (
    <section
      data-testid="sell-landing"
      aria-label="Sell on NasTech Market"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '70ch', display: 'grid', gap: raw.space.s5 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.75rem' }}>
          Sell the watch without meeting a stranger on faith.
        </h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary, fontSize: '1rem' }}>
          Listing is free. The buyer’s money is held until a handover PIN confirms the exchange, and
          the success fee is charged only when the order completes.
        </p>
      </header>

      <section aria-labelledby="sell-steps-heading">
        <h2 id="sell-steps-heading" style={{ margin: `0 0 ${raw.space.s2}`, fontSize: '1.15rem' }}>How selling works</h2>
        <ol style={{ margin: 0, paddingInlineStart: '1.2rem', display: 'grid', gap: raw.space.s2, fontSize: '0.9375rem' }}>
          <li>
            <strong>List at a 0% seller fee.</strong> The listing fee is {LISTING_FEE_BASIS_POINTS}%
            ({formatCents(0)}). You can leave the listing up without paying rent on it.
          </li>
          <li>
            <strong>Capture the item for {formatCents(CAPTURE_COST_CENTS)}, optional.</strong> The
            studio photographs the watch, compares its outer condition with your written
            disclosures, and publishes the photographs and 3D view.
          </li>
          <li>
            <strong>The buyer pays into the hold.</strong> NasTech holds the money; you are not asked
            to ship or hand over on a screenshot.
          </li>
          <li>
            <strong>Meet and confirm with a PIN.</strong> The buyer inspects the watch, then reads the
            six-digit code and you enter it. That is the moment the ledger learns the exchange
            happened.
          </li>
          <li>
            <strong>Settle at COMPLETED.</strong> The hold releases to you minus the {successRate}%
            success fee. A cancelled or refunded sale generates no success fee.
          </li>
        </ol>
      </section>

      <section aria-labelledby="sell-money-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="sell-money-heading" style={{ margin: 0, fontSize: '1.15rem' }}>The capture and the break-even price</h2>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          The capture costs {formatCents(CAPTURE_COST_CENTS)} per item. At the {successRate}% success
          fee, the fee on a completed sale equals that cost at{' '}
          <strong>{formatCents(CAPTURE_BREAK_EVEN_CENTS)}</strong>. That is the break-even price: below
          it the commission does not recover the studio run. It is not a minimum listing price, and
          it is not a claim that a cheaper watch is worth less.
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          Example at {formatCents(EXAMPLE_SALE_PRICE_CENTS)}: success fee{' '}
          {formatCents(EXAMPLE_SUCCESS_FEE_CENTS)}, seller payout{' '}
          {formatCents(EXAMPLE_PAYOUT_CENTS)} before any capture charge you opted into.
        </p>
      </section>

      <section aria-labelledby="sell-claim-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="sell-claim-heading" style={{ margin: 0, fontSize: '1.15rem' }}>What the capture proves — and does not</h2>
        <p style={{ margin: 0, padding: raw.space.s3, background: raw.color.paperWarm, borderRadius: raw.radius.md, fontSize: '0.9375rem' }}>
          {CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition}
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          The tier vocabulary records process steps, not opinions: an inspected item means the
          studio handled it and compared outer condition. It does not mean genuine, serviced, keeping
          time or water-resistant. Buyers can read the full vocabulary before they pay.
        </p>
      </section>

      <section aria-labelledby="sell-start-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="sell-start-heading" style={{ margin: 0, fontSize: '1.15rem' }}>Start here</h2>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          <a href="/sign-in" style={link}>Create a buyer account</a>
          {' · '}
          <a href="/help" style={link}>Fees and capture, in one place</a>
          {' · '}
          <a href="/safety/policy/fees" style={link}>The full fees policy</a>
          {' · '}
          <a href="/safety/policy/prohibited" style={link}>What may not be listed</a>
        </p>
      </section>
    </section>
  );
}

const link = { color: tokens.action.default, fontWeight: 600 } as const;
