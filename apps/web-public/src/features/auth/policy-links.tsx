import { raw, tokens } from '@nastech/design-tokens';

/**
 * Policy surfaces on auth screens. The design-system `POLICY_LINKS` list carries the canonical
 * hrefs/text (it is a done package — we read it, we don't fork it); this wrapper adds the POPIA
 * data-rights entry, because "access or delete my information" must be reachable from the same
 * place consent is collected, not buried three menus deep after sign-up.
 */
import { POLICY_LINKS } from '@nastech/design-system';
import { goTo } from './fields.js';
import { S } from './styles.js';

export function PolicyLinks() {
  return (
    <nav aria-label="Legal and policy" style={{ fontFamily: raw.type.familyText, display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
      <ul style={{ display: 'flex', gap: raw.space.s4, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
        {POLICY_LINKS.map((link) => (
          <li key={link.key}>
            <a href={link.href} style={{ color: tokens.text.secondary, fontSize: '0.8125rem', textDecoration: 'underline' }}>
              {link.text}
            </a>
          </li>
        ))}
      </ul>
      <p style={{ ...S.p, fontSize: '0.8125rem' }}>
        <a
          href="/account/data-request"
          onClick={(e) => {
            e.preventDefault();
            goTo('/account/data-request');
          }}
          style={{ color: tokens.action.default, textDecoration: 'underline' }}
          data-testid="data-rights-link"
        >
          Access or delete your information (POPIA)
        </a>{' '}
        — you can do this anytime, from any screen.
      </p>
    </nav>
  );
}
