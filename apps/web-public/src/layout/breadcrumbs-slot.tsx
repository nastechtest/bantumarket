import { raw, tokens } from '@nastech/design-tokens';

/**
 * Breadcrumb slot. A *slot*: pages supply the trail (they know their category, the shell does
 * not), and an absent trail renders nothing — no "Home /" noise line. The last crumb is the
 * current page and is not a link; a link to where you already are is a click that does nothing.
 */

export interface Crumb {
  readonly href: string;
  readonly label: string;
}

export function BreadcrumbsSlot({ trail }: { readonly trail: readonly Crumb[] }) {
  if (trail.length === 0) return null;
  const last = trail.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="nt-breadcrumbs" style={{ fontFamily: raw.type.familyText, paddingBlock: raw.space.s3 }}>
      <ol style={{ display: 'flex', gap: raw.space.s2, alignItems: 'center', margin: 0, padding: 0, listStyle: 'none', flexWrap: 'wrap', fontSize: '0.85rem' }}>
        {trail.map((crumb, i) => (
          <li key={`${crumb.href}:${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: raw.space.s2 }}>
            {i > 0 ? <span aria-hidden="true" style={{ color: tokens.text.disabled }}>/</span> : null}
            {i === last ? (
              <span aria-current="page" style={{ color: tokens.text.primary }}>
                {crumb.label}
              </span>
            ) : (
              <a href={crumb.href} style={{ color: tokens.text.secondary, textDecoration: 'underline' }}>
                {crumb.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
