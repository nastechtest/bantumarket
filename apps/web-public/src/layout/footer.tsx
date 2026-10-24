import { raw, tokens } from '@nastech/design-tokens';
import { PolicyLinks } from '@nastech/design-system';
import { supportHref, type SupportContact } from '../bootstrap/support-number.js';

/**
 * Footer: the compliance surfaces (POPIA notice, CPA returns, terms) are the reason this exists —
 * their *presence* on public pages is the contract, imported from design-system so the list can
 * never differ between the footer and the checkout that must also show them. Contact is rendered
 * only when the app actually has a support contact configured (see support-number.ts); a footer
 * that prints a fake number fails the same honesty test as a queued payment.
 */
export function Footer({ support }: { readonly support: SupportContact | null }) {
  return (
    <footer
      className="nt-footer"
      style={{
        borderTop: `1px solid ${raw.color.ink100}`,
        background: tokens.surface.raised,
        fontFamily: raw.type.familyText,
        color: tokens.text.secondary,
        padding: `${raw.space.s6} 0`,
        marginTop: raw.space.s7,
      }}
    >
      <div
        style={{
          maxWidth: tokens.layout.contentMax,
          marginInline: 'auto',
          paddingInline: raw.space.s4,
          display: 'flex',
          flexDirection: 'column',
          gap: raw.space.s4,
        }}
      >
        <PolicyLinks />
        <div style={{ display: 'flex', gap: raw.space.s4, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <a href="/help" style={{ color: tokens.text.secondary, textDecoration: 'underline' }}>
            Help and fees
          </a>
          <a href="/legal/humans" style={{ color: tokens.text.secondary, textDecoration: 'underline' }}>
            Team
          </a>
          {support === null ? null : (
            <a href={supportHref(support)} style={{ color: tokens.text.secondary, textDecoration: 'underline' }}>
              Support: {support.display}
            </a>
          )}
          <span style={{ fontSize: '0.8125rem' }}>
            NasTech Market · Johannesburg, South Africa · everything here is somebody else&apos;s second-hand good, inspected by us only as stated.
          </span>
        </div>
      </div>
    </footer>
  );
}
