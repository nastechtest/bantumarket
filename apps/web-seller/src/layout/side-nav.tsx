import { NavIcon, navGlyphFor } from './icons.js';
import { useIsDesktop } from './use-media.js';
import type { NavItem } from '../nav/nav-items.js';

/**
 * Desktop half of the one nav model. Renders nothing below `md`, where `MobileNav` takes over;
 * both are fed the same `NavItem[]`, so they cannot disagree about where a seller can go.
 */
export function SideNav({
  items,
  activePath,
}: {
  readonly items: readonly NavItem[];
  readonly activePath: string | null;
}) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return null;

  return (
    <nav className="nt-side-nav" aria-label="Seller sections">
      <ul className="nt-nav-list">
        {items.map((item) => {
          const active = item.path === activePath;
          return (
            <li key={item.path}>
              <a
                className="nt-nav-link"
                href={item.path}
                aria-current={active ? 'page' : undefined}
                data-active={active ? 'true' : 'false'}
              >
                <NavIcon glyph={navGlyphFor(item.path)} />
                <span>{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
