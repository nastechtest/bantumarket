import { raw, tokens } from '@nastech/design-tokens';
import { TAP_TARGET_PX } from './breakpoints.js';
import { MOBILE_NAV } from './primary-nav.js';
import { useIsDesktop } from './use-media.js';

/**
 * The bottom tab bar — primary nav on the device most buyers actually use (a 2019-era Android
 * at 320px CSS width, held in one hand, operated by a thumb that is not 12px precise).
 *
 * Hit-area rule, enforced by nav.test.tsx against the *token scale*, not a screenshot: every
 * tab is at least TAP_TARGET_PX tall and wide, which is the first step in the design-tokens
 * spacing scale that clears the 44px floor (s7 = 48px). The visual label may be smaller; the
 * touch target never is.
 *
 * Hidden at desktop widths — the header nav takes over there (see primary-nav.tsx for why both
 * read one list).
 */
export function MobileTabBar({ activePath }: { readonly activePath: string }) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;

  return (
    <nav aria-label="Primary (mobile)" className="nt-tab-bar" style={{ background: tokens.surface.primary, borderTop: `1px solid ${raw.color.ink100}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul style={{ display: 'flex', margin: 0, padding: 0, listStyle: 'none', maxWidth: tokens.layout.contentMax, marginInline: 'auto' }}>
        {MOBILE_NAV.map((item) => {
          const active = item.href === activePath || (item.area !== 'home' && activePath.startsWith(item.href));
          return (
            <li key={item.href} style={{ flex: '1 1 0', minWidth: TAP_TARGET_PX }}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="nt-tab-bar__item"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  minHeight: TAP_TARGET_PX,
                  minWidth: TAP_TARGET_PX,
                  padding: `${raw.space.s2} ${raw.space.s1}`,
                  color: active ? tokens.text.primary : tokens.text.secondary,
                  textDecoration: 'none',
                  fontFamily: raw.type.familyText,
                  fontSize: '0.72rem',
                  boxSizing: 'border-box',
                }}
              >
                <item.icon size={22} />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
