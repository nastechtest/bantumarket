import type { ReactNode } from 'react';
import type { NavSection } from '../nav/nav-model.js';
import { isCurrentNavPath } from '../nav/nav-model.js';

export interface SideNavProps {
  readonly sections: readonly NavSection[];
  readonly currentPath: string;
  readonly footer?: ReactNode;
  readonly emptyMessage?: string;
}

/**
 * The rail. Each section is a named list rather than a disclosure widget: collapsing a staff
 * section hides destinations that the session is entitled to, and a console should not make access
 * look optional. `aria-current="page"` is the only current-state signal a reader should trust;
 * colour and weight duplicate it for sighted operators.
 */
export function SideNav({
  sections,
  currentPath,
  footer,
  emptyMessage = 'No sections are available for this account.',
}: SideNavProps) {
  return (
    <nav className="ops-nav" aria-label="Staff sections" data-testid="staff-nav">
      {sections.length === 0 ? (
        <p className="ops-nav-empty">{emptyMessage}</p>
      ) : (
        sections.map((section) => (
          <div className="ops-nav-section" key={section.id}>
            <p className="ops-nav-title" aria-hidden="true">
              {section.title}
            </p>
            <ul className="ops-nav-list" aria-label={section.title}>
              {section.items.map((item) => (
                <li key={item.path}>
                  <a
                    href={item.path}
                    className="ops-nav-link"
                    data-nav-path={item.path}
                    {...(isCurrentNavPath(item.path, currentPath)
                      ? { 'aria-current': 'page' as const }
                      : {})}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {footer === undefined ? null : <div className="ops-nav-footer">{footer}</div>}
    </nav>
  );
}
