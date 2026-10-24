import type { ComponentType } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { IconAccount, IconHome, IconSearch, IconTag } from './icons.js';

/**
 * One nav model, two renderings (header row, mobile tab bar). Splitting the data from the
 * chrome is what keeps "where am I" identical between them — two lists drift, one list doesn't.
 * `route` is the web path this nav item currently represents; the controller owns the real
 * route table (`router.tsx`) and these paths mirror its `Routes` rows. `/sell` is not wired yet
 * (seller app is a separate surface) — it exists here so the tab bar has the thumb slot the
 * buyer will reach for; the report flags the route to the controller.
 */
export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: ComponentType<{ size?: number }>;
  readonly area: 'home' | 'search' | 'sell' | 'account';
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/', label: 'Home', icon: IconHome, area: 'home' },
  { href: '/search', label: 'Search', icon: IconSearch, area: 'search' },
  { href: '/sell', label: 'Sell', icon: IconTag, area: 'sell' },
];

export const MOBILE_NAV: readonly NavItem[] = [
  ...PRIMARY_NAV,
  { href: '/sign-in', label: 'Account', icon: IconAccount, area: 'account' },
];

export function PrimaryNav({ activePath }: { readonly activePath: string }) {
  return (
    <nav aria-label="Primary" className="nt-primary-nav">
      <ul style={{ display: 'flex', gap: raw.space.s5, alignItems: 'center', margin: 0, padding: 0, listStyle: 'none' }}>
        {PRIMARY_NAV.map((item) => {
          const active = item.href === activePath || (item.area !== 'home' && activePath.startsWith(item.href));
          return (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'inline-flex',
                  gap: raw.space.s2,
                  alignItems: 'center',
                  paddingBlock: raw.space.s2,
                  color: active ? tokens.text.primary : tokens.text.secondary,
                  textDecoration: 'none',
                  fontFamily: raw.type.familyText,
                  fontSize: '0.95rem',
                  borderBottom: active ? `2px solid ${tokens.action.default}` : '2px solid transparent',
                }}
              >
                <item.icon size={18} />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
