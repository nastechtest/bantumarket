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
 * Help centre: the money questions a buyer or seller asks before trusting the product.
 *
 * The fee table is the same integer cents the ledger books, formatted by `formatCents`. The
 * capture paragraph renders the contract's own claim-scope sentence, so a page about inspection
 * cannot quietly promise authenticity or timing.
 */
export function HelpCentre() {
  const successRate = SUCCESS_FEE_BASIS_POINTS / 100;
  return (
    <section
      data-testid="help-centre"
      aria-label="Help and fees"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '70ch', display: 'grid', gap: raw.space.s5 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>Help centre</h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
          Plain answers about fees, capture and the handover. Every rand amount here is an integer
          cent value through the same formatter the ledger screens use.
        </p>
      </header>

      <section aria-labelledby="help-fees-heading" style={{ display: 'grid', gap: raw.space.s3 }}>
        <h2 id="help-fees-heading" style={{ margin: 0, fontSize: '1.15rem' }}>Fees, in rand</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9375rem' }}>
          <caption style={{ textAlign: 'start', color: tokens.text.secondary, fontSize: '0.875rem', paddingBottom: raw.space.s2 }}>
            Pilot rates. A fee is only ever charged from the ledger’s settled state.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={th}>Line</th>
              <th scope="col" style={th}>Amount</th>
              <th scope="col" style={th}>When it is charged</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" style={th}>Seller listing fee</th>
              <td style={td}>{LISTING_FEE_BASIS_POINTS}% ({formatCents(0)})</td>
              <td style={td}>Never. Listing and keeping a listing up costs nothing.</td>
            </tr>
            <tr>
              <th scope="row" style={th}>Success fee</th>
              <td style={td}>{successRate}% of the sale price</td>
              <td style={td}>Only when the order reaches COMPLETED; a cancel or refund generates none.</td>
            </tr>
            <tr>
              <th scope="row" style={th}>3D capture, optional</th>
              <td style={td}>{formatCents(CAPTURE_COST_CENTS)} per item</td>
              <td style={td}>Paid by the seller when the studio photographs and handles the item.</td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          Worked example: a watch sells for {formatCents(EXAMPLE_SALE_PRICE_CENTS)}. The success fee is{' '}
          {formatCents(EXAMPLE_SUCCESS_FEE_CENTS)}, so the seller side of the ledger shows{' '}
          {formatCents(EXAMPLE_PAYOUT_CENTS)} once the order completes.
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          The 0% seller fee covers listing. The success fee pays for the meeting room — listings, the
          money hold, the review queue and the capture studio — not for an opinion on the watch.
        </p>
      </section>

      <section aria-labelledby="help-capture-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="help-capture-heading" style={{ margin: 0, fontSize: '1.15rem' }}>What the {formatCents(CAPTURE_COST_CENTS)} capture buys</h2>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          A capture is a photography run in the Cape Town studio: the watch is handled, photographed
          from 48 angles and rebuilt so a buyer can turn it over before paying. The outer condition
          is compared against the seller’s written disclosures, and any mark that was not disclosed
          is added to the caption list.
        </p>
        <p style={{ margin: 0, padding: raw.space.s3, background: raw.color.paperWarm, borderRadius: raw.radius.md, fontSize: '0.9375rem' }}>
          {CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition}
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          At the {successRate}% success fee, a capture pays for itself once the completed sale price
          reaches {formatCents(CAPTURE_BREAK_EVEN_CENTS)}. Below that line the fee does not cover the
          {` ${formatCents(CAPTURE_COST_CENTS)} `}studio run; that is the break-even price, not a
          statement that cheaper watches cannot be captured.
        </p>
      </section>

      <section aria-labelledby="help-handover-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="help-handover-heading" style={{ margin: 0, fontSize: '1.15rem' }}>Handover, in one paragraph</h2>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          Money sits with NasTech, not the seller, until the buyer reads out the six-digit PIN and
          the seller enters it at the meeting. Both people pressing “done” is not a handover; the
          code is the physical world talking to the ledger. Inspect the watch before the PIN is read
          — after it, the hold is released.
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          <a href="/safety/how-it-works" style={link}>How a sale works, state by state</a>
          {' · '}
          <a href="/safety/meet-safely" style={link}>Where to meet</a>
          {' · '}
          <a href="/safety/report" style={link}>Report a problem</a>
        </p>
      </section>

      <section aria-labelledby="help-next-heading" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="help-next-heading" style={{ margin: 0, fontSize: '1.15rem' }}>Still need a person?</h2>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          The safety queue is staffed by humans and has a first-response target, not a promise. If
          your question is about your own information, the POPIA request path is open without an
          account.
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          <a href="/safety/policy/fees" style={link}>The full fees policy</a>
          {' · '}
          <a href="/account/data-request" style={link}>Access or delete your information</a>
          {' · '}
          <a href="/legal/terms" style={link}>Terms of sale</a>
        </p>
      </section>
    </section>
  );
}

const th = {
  textAlign: 'start',
  padding: `${raw.space.s2} ${raw.space.s3}`,
  borderBottom: `1px solid ${raw.color.ink100}`,
  verticalAlign: 'top',
} as const;

const td = {
  padding: `${raw.space.s2} ${raw.space.s3}`,
  borderBottom: `1px solid ${raw.color.ink100}`,
  verticalAlign: 'top',
  color: tokens.text.secondary,
} as const;

const link = { color: tokens.action.default, fontWeight: 600 } as const;
