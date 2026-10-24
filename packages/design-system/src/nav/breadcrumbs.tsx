import { raw, tokens } from '@nastech/design-tokens';

export interface Crumb {
  readonly label: string;
  /** The last crumb has no href — it *is* the current page; linking to yourself is a loop. */
  readonly href?: string;
}

/**
 * Location, not history: the trail shows where this page sits in the tree. `nav` is labelled so
 * two landmarks (this and the main nav) are distinguishable, the order is an `ol`, and the last
 * entry gets `aria-current="page"` as plain text — a reader must hear "current page", not just
 * see an unlinked word.
 */
export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  const lastIndex = trail.length - 1;
  return (
    <nav className="ds-breadcrumbs" aria-label="Breadcrumb" style={{ fontFamily: raw.type.familyText, fontSize: '0.8125rem' }}>
      <ol style={{ display: 'flex', gap: raw.space.s2, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
        {trail.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} style={{ display: 'inline-flex', gap: raw.space.s2, alignItems: 'center' }}>
            {index === lastIndex || !crumb.href ? (
              <span {...(index === lastIndex ? { 'aria-current': 'page' as const } : {})} style={{ color: tokens.text.secondary }}>
                {crumb.label}
              </span>
            ) : (
              <>
                <a href={crumb.href} style={{ color: tokens.text.secondary, textDecoration: 'underline' }}>
                  {crumb.label}
                </a>
                <span aria-hidden="true" style={{ color: tokens.text.disabled }}>
                  /
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
