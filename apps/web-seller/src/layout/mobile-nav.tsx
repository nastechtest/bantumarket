import { NavIcon, navGlyphFor } from './icons.js';
import { useIsDesktop } from './use-media.js';
import type { NavItem } from '../nav/nav-items.js';

/**
 * Compact navigation, rendered above main so it is the first destination list a keyboard or
 * screen-reader user meets. Horizontally scrollable rather than a six-slot thumb bar: payouts
 * belongs in reach, not behind a "More" overflow that hides money.
 */
export function MobileNav({
  items,
  activePath,
}: {
  readonly items: readonly NavItem[];
  readonly activePath: string | null;
}) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;

  return (
    <nav className="nt-mobile-nav" aria-label="Seller sections (compact)">
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
