import { raw, tokens } from '@nastech/design-tokens';

/**
 * The “Team” link in the footer. It names roles, not people: the repo has no staff roster or
 * photos, and inventing faces on a trust page is the same failure as inventing a verification.
 */
export function HumansPage() {
  return (
    <section
      data-testid="humans-page"
      aria-label="The people behind the market"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '70ch', display: 'grid', gap: raw.space.s4 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>The people behind the market</h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
          NasTech Market is run from Johannesburg. The screens are deliberately specific about what
          is automated and what a person actually does; this page is the short version of who does
          what.
        </p>
      </header>

      <section>
        <h2 style={h2}>The review queue</h2>
        <p style={p}>
          Reports are read by trained reviewers, not classified by a model and not auto-banned. A
          reviewer can ask for more evidence, remove a listing, or close a report with a written
          reason. Their access is audited under a named account, and the person reported can see
          the reason and attachments.
        </p>
      </section>

      <section>
        <h2 style={h2}>The capture studio</h2>
        <p style={p}>
          The Cape Town studio handles and photographs items for sellers who opt into a capture. The
          studio records outer condition against the seller’s written disclosures. It does not
          authenticate, service or value the watch, and no studio screen says it does.
        </p>
      </section>

      <section>
        <h2 style={h2}>Support and privacy</h2>
        <p style={p}>
          Support answers order and handover questions. Privacy requests go through the POPIA path,
          where identity is confirmed before an access copy or deletion is actioned. If a support
          contact has not been configured, the app says so rather than printing a number nobody
          answers.
        </p>
        <p style={{ ...p, margin: 0 }}>
          <a href="/account/data-request" style={link}>Access or delete your information</a>
          {' · '}
          <a href="/safety/policy/popia" style={link}>Safety records and retention</a>
          {' · '}
          <a href="/legal/privacy" style={link}>Privacy notice</a>
        </p>
      </section>

      <section>
        <h2 style={h2}>What we will not do</h2>
        <p style={p}>
          We will not tell you an item is genuine, that it keeps time, or that a price is fair. Those
          are opinions the platform does not hold. The tier phrases record process steps, and the
          capture disclosure records what the photographs can and cannot show.
        </p>
        <p style={{ ...p, margin: 0 }}>
          <a href="/safety/trust" style={link}>What each tier records</a>
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
