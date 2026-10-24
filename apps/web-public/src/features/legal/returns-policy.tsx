import { raw, tokens } from '@nastech/design-tokens';

/**
 * Returns and the CPA. The link label says s.18–s.20, so the page must be precise about what those
 * sections do: they govern fixed-term agreements and direct-marketing cooling-off, not a universal
 * seven-day return on a private second-hand sale. The real remedy for “not as described” is the
 * dispute path, and the page sends people there.
 */
export function ReturnsPolicy() {
  return (
    <section
      data-testid="returns-policy"
      aria-label="Returns policy"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '70ch', display: 'grid', gap: raw.space.s4 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>Returns policy</h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
          This is a marketplace between two people, not a shop selling its own stock. That changes
          which return rights apply, and the page says which is which instead of implying a universal
          cooling-off period.
        </p>
      </header>

      <section>
        <h2 style={h2}>If the item is not as described</h2>
        <p style={p}>
          Open a dispute from the order before the dispute window closes. The money stays held while
          a human reviews the listing, the messages and the condition record; it does not move to
          either party while the review is open. A refund only counts once the ledger says it
          settled — “requested” and “settled” are different states.
        </p>
        <p style={{ ...p, margin: 0 }}>
          <a href="/orders" style={link}>Open your orders</a>
          {' · '}
          <a href="/safety/how-it-works" style={link}>What the order states mean</a>
        </p>
      </section>

      <section>
        <h2 style={h2}>The Consumer Protection Act</h2>
        <p style={p}>
          The CPA’s fixed-term rules (s.18) and the direct-marketing cooling-off right (s.20) apply
          where their own terms are met. A private sale arranged through this market is not
          automatically a seven-day no-questions return, and this page does not pretend otherwise.
          Where the CPA gives you a right, the dispute path is how you exercise it here.
        </p>
      </section>

      <section>
        <h2 style={h2}>Change of mind</h2>
        <p style={p}>
          A seller is not obliged to accept a change-of-mind return. Before paying, ask every
          question and read the condition captions; after handover, a change of mind is a
          conversation with the seller, not a platform refund. If a seller chooses to accept one,
          agree the return in the order messages so the money record has evidence.
        </p>
      </section>

      <section>
        <h2 style={h2}>What a refund never does</h2>
        <p style={p}>
          It does not unmake the capture cost the seller paid, and it does not rewrite the order
          history. The ledger keeps the sale, the reversal and the reason; deleting the record would
          make the next dispute unprovable.
        </p>
        <p style={{ ...p, margin: 0 }}>
          <a href="/legal/terms" style={link}>Terms of sale</a>
          {' · '}
          <a href="/help" style={link}>Help and fees</a>
        </p>
      </section>
    </section>
  );
}

const h2 = { margin: `0 0 ${raw.space.s2}`, fontFamily: raw.type.familyDisplay, fontSize: '1.1rem' } as const;
const p = { margin: `0 0 ${raw.space.s2}`, fontSize: '0.9375rem', color: tokens.text.secondary } as const;
const link = { color: tokens.action.default, fontWeight: 600 } as const;
