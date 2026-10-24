import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import { formatCents } from '@nastech/design-system';
import { FEE_TERMS } from '../api/safety-transport.js';
import { fixtureSaleExample } from '../api/fixtures.js';

/**
 * What the platform charges, when, and what the money does NOT buy. The fee is a claim surface:
 * a "10 % commission" page that also implies protection is exactly the drift §13.2 exists for, so
 * the last section is required, not decorative.
 */
export function FeesPolicy() {
  const pct = FEE_TERMS.successFeeBasisPoints / 100;
  return (
    <section
      className="safety-policy-fees"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay }}>Fees</h2>
      <ul style={{ paddingInlineStart: '1.2rem' }}>
        <li style={{ marginBottom: raw.space.s2 }}>
          <strong>Listing: R0.</strong> List a watch, pay nothing, and leave whenever you like.
        </li>
        <li style={{ marginBottom: raw.space.s2 }}>
          <strong>Success fee: {pct} % of the sale price, charged only when the order reaches
          COMPLETED.</strong> Not at “paid”, not at “handover scheduled” — at completed. A sale that
          cancels before handover, or refunds back out of escrow, generates no fee.
        </li>
        <li style={{ marginBottom: raw.space.s2 }}>
          <strong>Worked example, this week’s fixture:</strong> {fixtureSaleExample.title} sells for{' '}
          {formatCents(fixtureSaleExample.price.cents)}. The fee is{' '}
          {formatCents(fixtureSaleExample.fee.cents)}; the seller side of the ledger shows{' '}
          {formatCents(fixtureSaleExample.payout.cents)} once the order completes.
        </li>
        <li style={{ marginBottom: raw.space.s2 }}>
          <strong>3D capture: R270 per item, optional.</strong> It buys the photography run and a
          listing that can say “{TIER_LABELS.T4}”. It buys photographs and a condition comparison —
          see the section below.
        </li>
        <li>
          <strong>Refunds.</strong> A refund only moves money at the ledger’s settled state; while
          one is merely requested, any screen saying the money “has moved” would be lying to the
          seller, so none does.
        </li>
      </ul>
      <h3
        style={{
          marginTop: raw.space.s5,
          borderLeft: `3px solid ${raw.color.ink100}`,
          paddingInlineStart: raw.space.s3,
          fontSize: '1.02rem',
        }}
      >
        What your fee does not buy
      </h3>
      <p style={{ margin: 0 }}>
        The fee pays for the meeting room: listings, the chat, the money hold, the review queue, and
        the capture studio. It does not pay for an opinion on your watch. Nobody at the platform
        assesses whether an item is genuine, whether it keeps time, or whether you are about to make
        a good deal — and no tier phrase, fee line or receipt here claims otherwise. If the price of
        a “{TIER_LABELS.T4}” run made such a judgement sound included, the phrase would have to
        change in the contracts file first.
      </p>
    </section>
  );
}
