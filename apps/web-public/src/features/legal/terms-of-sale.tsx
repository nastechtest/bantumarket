import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/** Terms of sale: the marketplace's role, the handover moment, fees and the claim boundary. */
export function TermsOfSale() {
  return (
    <section
      data-testid="terms-of-sale"
      aria-label="Terms of sale"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '70ch', display: 'grid', gap: raw.space.s4 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>Terms of sale</h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
          These terms describe what NasTech Market does in a sale, what the buyer and seller each
          owe, and what no screen here claims. They do not replace the rights the law gives you.
        </p>
      </header>

      <section>
        <h2 style={h2}>The parties</h2>
        <p style={p}>
          The seller owns the item and makes the description. The buyer pays the price. NasTech
          Market operates the listing, the money hold, the handover record and the review queue; it
          is not the seller and does not become the owner of the item at any point.
        </p>
      </section>

      <section>
        <h2 style={h2}>Listing and condition</h2>
        <p style={p}>
          A seller must describe the item honestly, including marks, repairs and missing papers. A
          capture adds photographs and an outer-condition comparison; it does not turn an
          undisclosed fault into a disclosed one.
        </p>
        <p style={{ ...p, margin: 0, padding: raw.space.s3, background: raw.color.paperWarm, borderRadius: raw.radius.md }}>
          {CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition}
        </p>
      </section>

      <section>
        <h2 style={h2}>Payment, handover and completion</h2>
        <p style={p}>
          The buyer pays into the hold. The order reaches COMPLETED only after the buyer reads the
          six-digit handover code and the seller enters it. The success fee is charged at COMPLETED;
          a cancelled order or a refunded sale generates no success fee. The full fee lines and the
          optional capture cost are on the fees page.
        </p>
        <p style={{ ...p, margin: 0 }}>
          <a href="/safety/policy/fees" style={link}>Fees policy</a>
          {' · '}
          <a href="/help" style={link}>Help and fees</a>
          {' · '}
          <a href="/safety/how-it-works" style={link}>How a sale works</a>
        </p>
      </section>

      <section>
        <h2 style={h2}>Disputes and prohibited items</h2>
        <p style={p}>
          A dispute is opened from the order it concerns; the money stays held while a human reviews
          it. Items on the prohibited list may not be listed at all, and a listing that breaks that
          rule can be removed without completing the sale.
        </p>
        <p style={{ ...p, margin: 0 }}>
          <a href="/safety/policy/prohibited" style={link}>What may not be listed</a>
          {' · '}
          <a href="/legal/returns" style={link}>Returns policy</a>
          {' · '}
          <a href="/legal/privacy" style={link}>Privacy notice</a>
        </p>
      </section>
    </section>
  );
}

const h2 = { margin: `0 0 ${raw.space.s2}`, fontFamily: raw.type.familyDisplay, fontSize: '1.1rem' } as const;
const p = { margin: `0 0 ${raw.space.s2}`, fontSize: '0.9375rem', color: tokens.text.secondary } as const;
const link = { color: tokens.action.default, fontWeight: 600 } as const;
