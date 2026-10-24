import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * The buyer-app privacy notice. It is a public route because the footer and every auth screen
 * link here; the safety feature has a deeper note about report records and points at this page
 * for the general processing story.
 */
export function PrivacyNotice() {
  return (
    <section
      data-testid="privacy-notice"
      aria-label="Privacy notice"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '70ch', display: 'grid', gap: raw.space.s4 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>Privacy notice (POPIA)</h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
          NasTech Market, Johannesburg, is the responsible party for the personal information
          described here. This notice is written for the buyer app; the safety feature adds the
          detail specific to reports and ID checks.
        </p>
      </header>

      <section>
        <h2 style={h2}>What we collect, and why</h2>
        <ul style={list}>
          <li>
            <strong>Account and contact details</strong> — a phone number, and an email address or
            password if you choose them. Necessary to perform the contract you sign up to
            (POPIA s11(2)(b)).
          </li>
          <li>
            <strong>Listings, orders, messages and handover records</strong> — necessary to run the
            sale, hold the money and prove what happened if a dispute opens.
          </li>
          <li>
            <strong>Capture media and condition disclosures</strong> — created when a seller opts
            into the studio run. The media evidences the outer condition and shape of the item; it
            does not evidence authenticity, movement or value.
          </li>
          <li>
            <strong>Optional analytics</strong> — only after you choose. We count steps and ranges,
            never a word you typed, an amount you paid or a phone number.
          </li>
        </ul>
      </section>

      <section>
        <h2 style={h2}>Who sees it</h2>
        <p style={p}>
          The other party sees what a sale needs: your display name, the listing, the messages you
          send and the handover arrangements. The payment provider sees what it needs to move money.
          The capture studio sees the item and the seller’s disclosures. Our review queue sees
          reports and the evidence attached to them under named-account audit. We do not sell
          personal information.
        </p>
      </section>

      <section>
        <h2 style={h2}>How long we keep it</h2>
        <p style={p}>
          Order, payment and tax records stay for as long as the law and the ledger require them to
          remain provable. Safety records follow the retention stated on the safety POPIA page. An
          account deletion removes what no longer has a lawful purpose; it does not delete a
          completed sale’s money trail.
        </p>
      </section>

      <section>
        <h2 style={h2}>Your rights</h2>
        <p style={p}>
          You can ask for a copy of your personal information, ask us to correct it, ask us to delete
          it, or object to processing. You can do this without still being signed in.
        </p>
        <p style={{ ...p, margin: 0 }}>
          <a href="/account/data-request" style={link}>Access or delete your information</a>
          {' · '}
          <a href="/safety/policy/popia" style={link}>Safety records and retention</a>
        </p>
        <p style={p}>
          If our answer is not good enough, the Information Regulator, South Africa, accepts
          complaints independently of us.
        </p>
      </section>

      <section>
        <h2 style={h2}>Security and the 3D view</h2>
        <p style={p}>
          Session tokens are not written to browser storage; the session is re-verified with the
          server before any signed-in screen is shown. Card numbers never reach this app.
        </p>
        <p style={{ ...p, margin: 0, padding: raw.space.s3, background: raw.color.paperWarm, borderRadius: raw.radius.md }}>
          {CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition}
        </p>
      </section>
    </section>
  );
}

const h2 = { margin: `0 0 ${raw.space.s2}`, fontFamily: raw.type.familyDisplay, fontSize: '1.1rem' } as const;
const p = { margin: `0 0 ${raw.space.s2}`, fontSize: '0.9375rem', color: tokens.text.secondary } as const;
const list = { margin: 0, paddingInlineStart: '1.2rem', fontSize: '0.9375rem', color: tokens.text.secondary } as const;
const link = { color: tokens.action.default, fontWeight: 600 } as const;
