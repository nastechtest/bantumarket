import { raw, tokens } from '@nastech/design-tokens';

/**
 * Compliance surfaces, not decoration: POPIA notice, CPA returns (the s.18 fixed-term / s.20
 * cooling-off area) and terms must be *present* on checkout, sign-in and the listing page. The
 * copy below is placeholder — the hrefs and their presence are the contract.
 */
export const POLICY_LINKS = [
  { key: 'privacy', href: '/legal/privacy', text: 'Privacy notice (POPIA)' },
  { key: 'returns', href: '/legal/returns', text: 'Returns policy (CPA s.18–s.20)' },
  { key: 'terms', href: '/legal/terms', text: 'Terms of sale' },
] as const;

export function PolicyLinks() {
  return (
    <nav className="ds-policy" aria-label="Legal and policy" style={{ fontFamily: raw.type.familyText }}>
      <ul style={{ display: 'flex', gap: raw.space.s4, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
        {POLICY_LINKS.map((link) => (
          <li key={link.key}>
            <a
              href={link.href}
              style={{ color: tokens.text.secondary, fontSize: '0.8125rem', textDecoration: 'underline' }}
            >
              {link.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
