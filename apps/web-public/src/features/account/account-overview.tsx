import { raw, tokens } from '@nastech/design-tokens';

/**
 * The account overview. It is a hub, not a second orders implementation: every money fact lives
 * on the order screen that reads the ledger, and the two rights that must never be buried — a
 * POPIA request and a safety report — are one link away.
 */

const LINK_STYLE = { color: tokens.action.default, fontWeight: 600, textDecoration: 'underline' } as const;

export function AccountOverview() {
  return (
    <section
      data-testid="account-overview"
      aria-label="Your account"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '70ch', display: 'grid', gap: raw.space.s5 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>Your account</h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
          One place for orders, disputes and the information you have given us. Sign-in and payment
          details are never shown here — the session screen only ever holds a masked hint.
        </p>
      </header>

      <section aria-labelledby="account-orders-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="account-orders-heading" style={{ margin: 0, fontSize: '1.1rem' }}>Orders and disputes</h2>
        <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.9375rem' }}>
          An order shows the ledger state, where the money is, and the actions that state permits.
          A dispute starts from the order it is about, because the review needs that order’s money
          hold and handover record — it cannot be opened from a blank form.
        </p>
        <p style={{ margin: 0 }}>
          <a href="/orders" style={LINK_STYLE}>Open your orders</a>
          {' · '}
          <a href="/account/orders" style={LINK_STYLE}>The shorter orders view</a>
        </p>
        <p style={{ margin: 0, fontSize: '0.875rem', color: tokens.text.secondary }}>
          While a dispute is open the money stays held. “Refund requested” and “refund settled” are
          different states, and the order screen prints the one the ledger actually holds.
        </p>
      </section>

      <section aria-labelledby="account-data-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="account-data-heading" style={{ margin: 0, fontSize: '1.1rem' }}>Your personal information</h2>
        <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.9375rem' }}>
          You can ask for a copy of what we hold, ask us to correct it, or ask us to delete it. That
          request does not need an account: the POPIA entry point stays reachable from the sign-in
          screen and from here.
        </p>
        <p style={{ margin: 0 }}>
          <a href="/account/data-request" style={LINK_STYLE}>Access or delete your information</a>
          {' · '}
          <a href="/safety/policy/popia" style={LINK_STYLE}>What safety records we keep</a>
        </p>
      </section>

      <section aria-labelledby="account-safety-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="account-safety-heading" style={{ margin: 0, fontSize: '1.1rem' }}>Safety</h2>
        <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.9375rem' }}>
          Mutes are real suppression on your side of the platform: hidden listings and refused
          messages, with the list to undo them. A report goes to a human review queue; it is not an
          automatic ban and it does not decide an outcome by itself.
        </p>
        <p style={{ margin: 0 }}>
          <a href="/safety/report" style={LINK_STYLE}>Report a listing, seller, order or handover</a>
          {' · '}
          <a href="/safety/blocking" style={LINK_STYLE}>Sellers you have muted</a>
        </p>
      </section>

      <section aria-labelledby="account-policy-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="account-policy-heading" style={{ margin: 0, fontSize: '1.1rem' }}>The paperwork</h2>
        <p style={{ margin: 0 }}>
          <a href="/legal/privacy" style={LINK_STYLE}>Privacy notice (POPIA)</a>
          {' · '}
          <a href="/legal/terms" style={LINK_STYLE}>Terms of sale</a>
          {' · '}
          <a href="/help" style={LINK_STYLE}>Help and fees</a>
        </p>
      </section>
    </section>
  );
}
