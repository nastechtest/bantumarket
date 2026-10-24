import { useState } from 'react';
import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export interface SideNavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly current?: boolean;
}

export interface SideNavSection {
  readonly title?: string;
  readonly items: readonly SideNavItem[];
}

export interface SideNavProps {
  label: string;
  sections: readonly SideNavSection[];
  /** Rendered at the foot — staff apps put the sign-out here, and it must stay inside the nav landmark. */
  footer?: ReactNode;
}

/**
 * The seller/staff app rail. Sections with titles are disclosure buttons: `aria-expanded` and
 * `aria-controls` stay truthful, and the list itself is what hides (display none), so collapsed
 * destinations cannot be tabbed to but are also not lying in the accessibility tree. The current
 * route gets `aria-current="page"`, the only state a reader should trust over styling.
 */
export function SideNav({ label, sections, footer }: SideNavProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (title: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  return (
    <nav className="ds-side-nav" aria-label={label} style={{ fontFamily: raw.type.familyText, fontSize: '0.875rem', color: tokens.text.primary }}>
      {sections.map((section, sectionIndex) => {
        const sectionKey = section.title ?? `section-${sectionIndex}`;
        const isCollapsed = section.title !== undefined && collapsed.has(sectionKey);
        const listId = `ds-side-nav-list-${sectionKey}`;
        return (
          <div key={sectionKey} style={{ marginBottom: raw.space.s4 }}>
            {section.title ? (
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-controls={listId}
                onClick={() => toggle(section.title!)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  color: tokens.text.secondary,
                  fontWeight: 600,
                  padding: `${raw.space.s1} ${raw.space.s2}`,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                {section.title}
              </button>
            ) : null}
            <ul
              id={section.title ? listId : undefined}
              aria-hidden={isCollapsed ? true : undefined}
              style={{
                display: isCollapsed ? 'none' : 'block',
                listStyle: 'none',
                margin: 0,
                padding: 0,
              }}
            >
              {section.items.map((item) => (
                <li key={item.key}>
                  <a
                    href={item.href}
                    {...(item.current ? { 'aria-current': 'page' as const } : {})}
                    data-state={item.current ? 'current' : undefined}
                    style={{
                      display: 'block',
                      padding: `${raw.space.s2} ${raw.space.s3}`,
                      borderRadius: raw.radius.sm,
                      color: item.current ? tokens.text.primary : tokens.text.secondary,
                      textDecoration: 'none',
                      fontWeight: item.current ? 600 : 400,
                      background: item.current ? tokens.surface.raised : 'none',
                    }}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {footer ? <div style={{ borderTop: `1px solid ${raw.color.ink100}`, paddingTop: raw.space.s3 }}>{footer}</div> : null}
    </nav>
  );
}
