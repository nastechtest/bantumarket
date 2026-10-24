import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * The whole machine in one page, for the person deciding whether to trust it: every stage of a
 * sale, where a human is involved, where money actually moves, and — as a section that cannot be
 * deleted — the things no stage does.
 */

export const SALE_STAGES: readonly { readonly state: string; readonly whatHappens: string }[] = [
  {
    state: 'AWAITING_PAYMENT',
    whatHappens:
      'Buyer and seller agreed the listing price; the order exists and holds the item out of other carts. No money has moved. This state is not “reserved”.',
  },
  {
    state: 'PAID',
    whatHappens:
      `The payment provider confirmed the money — this screen reads the provider’s answer, never the buyer’s screenshot. The amount now sits on our side, not the seller’s: the beginning of the “${TIER_LABELS.T5}” sentence.`,
  },
  {
    state: 'HANDOVER_SCHEDULED',
    whatHappens:
      'A time and a place exist in the app. This is where the meet-safely page matters most: the schedule is a booking, not a chaperone.',
  },
  {
    state: 'HANDOVER_CONFIRMED',
    whatHappens:
      'The buyer read the six-digit code at the meeting and the seller entered it. Both pressing “done” separately is not how it works — the code is the physical world talking to the ledger.',
  },
  {
    state: 'COMPLETED',
    whatHappens:
      'The money-bearing finish line: the hold releases to the seller minus the success fee, and the dispute window starts counting down the same day.',
  },
];

export const SIDE_STATES: readonly { readonly state: string; readonly whatHappens: string }[] = [
  {
    state: 'CANCELLED',
    whatHappens: 'Before payment, anyone can walk; after payment, cancelling means the held money goes back — no fee was ever charged.',
  },
  {
    state: 'IN_DISPUTE',
    whatHappens:
      'The buyer says “not as described” inside the window. The hold stays held — nobody’s money moves while a dispute is open; that is the point of it.',
  },
  {
    state: 'REFUND_PENDING → REFUNDED',
    whatHappens:
      'A pending refund is a decision that money should move; a refunded order is money that moved. Seller-facing screens show the difference, because “we refunded them” and “you have not been paid yet” are different Tuesdays.',
  },
];

export function HowItWorks() {
  return (
    <section
      className="safety-how-it-works"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '66ch' }}
    >
      <h2 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay }}>How a sale works here, and where humans are</h2>
      <p style={{ color: tokens.text.secondary }}>
        Two strangers, one watch, and a ledger that only moves money at four moments. Everything on
        this page is one of those two things: a state, or a person doing something.
      </p>
      <ol style={{ paddingInlineStart: '1.2rem' }}>
        {SALE_STAGES.map((stage) => (
          <li key={stage.state} style={{ marginBottom: raw.space.s3 }}>
            <p style={{ margin: 0, fontWeight: 600, fontFamily: raw.type.familyMono, fontSize: '0.88rem' }}>
              {stage.state}
            </p>
            <p style={{ margin: `${raw.space.s1} 0 0`, fontSize: '0.93rem' }}>{stage.whatHappens}</p>
          </li>
        ))}
      </ol>
      <h3 style={{ fontSize: '1rem' }}>The states that are not the straight line</h3>
      <ul style={{ paddingInlineStart: '1.2rem' }}>
        {SIDE_STATES.map((side) => (
          <li key={side.state} style={{ marginBottom: raw.space.s2, fontSize: '0.93rem' }}>
            <strong>{side.state}</strong> — {side.whatHappens}
          </li>
        ))}
      </ul>
      <h3 style={{ fontSize: '1rem' }}>Where a human being is actually involved</h3>
      <ul style={{ paddingInlineStart: '1.2rem', fontSize: '0.94rem' }}>
        <li style={{ marginBottom: raw.space.s2 }}>
          <strong>Onboarding:</strong> someone compares two photographs — that is the whole content
          of “{TIER_LABELS.T2}”.
        </li>
        <li style={{ marginBottom: raw.space.s2 }}>
          <strong>Listing review:</strong> someone reads the ad against policy — that is all
          “{TIER_LABELS.T3}” ever claims.
        </li>
        <li style={{ marginBottom: raw.space.s2 }}>
          <strong>Capture:</strong> the studio team sees and photographs the real item — “{TIER_LABELS.T4}”.
        </li>
        <li>
          <strong>The report queue:</strong> a person reads what you file, on the target-and-no-promise
          terms spelled out on the report page.
        </li>
      </ul>
      <p
        style={{
          margin: `${raw.space.s4} 0 0`,
          padding: raw.space.s3,
          background: raw.color.paperWarm,
          borderRadius: raw.radius.md,
          fontSize: '0.9rem',
        }}
      >
        <strong>No stage of this machine does the following, ever:</strong> authenticates a watch,
        opens a caseback, measures timekeeping, pressure-tests a seal, chaperones a meeting, judges
        the fairness of your price, or resolves an argument with a vibe. The dispute process reads
        what was written in the listing and what the ledger did — nothing else, and that is by
        design: it is the one part of this product you can point at in five years and check.
      </p>
    </section>
  );
}
