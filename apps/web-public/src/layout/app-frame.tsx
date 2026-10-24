import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { offlineBannerCopy, useOnlineStatus, type OnlineStore } from '../lib/online-status.js';
import type { AccountState } from './account-menu.js';
import { Container } from './container.js';
import { Footer } from './footer.js';
import { Header } from './header.js';
import { MobileTabBar } from './mobile-tab-bar.js';
import { usePageTitle } from './page-title.js';
import type { SupportContact } from '../bootstrap/support-number.js';

/**
 * The frame every public page hangs in.
 *
 * Contract with the controller (router.tsx / main.tsx): `AppFrame` wraps the routed page —
 * `<AppFrame activePath={route.path} routeLabel={route.label} account={...}>{page}</AppFrame>`.
 * It is deliberately NOT importing router.tsx: the router owns page loading, and the chrome
 * importing it would drag the route table's module side effects (window listeners) into every
 * static render and, worse, invite the chrome to depend on route modules. `activePath`/`routeLabel`
 * are strings; the fence stays trivial.
 *
 * Order inside the frame is an a11y order: skip link first in the DOM (it is the first tab stop),
 * banner, offline banner, main, content-info, then the thumb nav. The offline banner is `role=
 * status` + `aria-live=polite`: reconnecting must not startle anyone mid-sentence.
 */
export function AppFrame({
  activePath,
  routeLabel,
  account,
  support,
  onlineStore,
  children,
  footer = true,
  tabBar = true,
}: {
  readonly activePath: string;
  readonly routeLabel: string;
  readonly account: AccountState;
  readonly support: SupportContact | null;
  readonly onlineStore?: OnlineStore;
  readonly children: ReactNode;
  readonly footer?: boolean;
  readonly tabBar?: boolean;
}) {
  const online = useOnlineStatus(onlineStore);
  usePageTitle(routeLabel);
  const banner = offlineBannerCopy(online);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: tokens.surface.primary }}>
      <a className="nt-skip-link" href="#nt-main">
        Skip to content
      </a>
      <Header activePath={activePath} account={account} online={online} />
      {banner === null ? null : (
        <div className="nt-offline-banner" role="status" aria-live="polite">
          <Container>
            <p style={{ fontFamily: raw.type.familyText, fontSize: '0.9rem', color: tokens.text.primary, paddingBlock: raw.space.s3, margin: 0 }}>
              {banner}
            </p>
          </Container>
        </div>
      )}
      <main id="nt-main" style={{ flex: 1 }}>
        <Container>{children}</Container>
      </main>
      {footer ? <Footer support={support} /> : null}
      {tabBar ? <MobileTabBar activePath={activePath} /> : null}
    </div>
  );
}

/**
 * Consent banner slot (POPIA cookie consent belongs to whoever owns consent, not the shell).
 * The shell's job: the fixed bottom region, the layer above the tab bar, and the guarantee that
 * it exists in the DOM exactly once. It renders nothing until content is passed — a slot is not
 * a component that invents its own banner.
 */
export function ConsentBannerSlot({ children }: { readonly children?: ReactNode }) {
  if (children === undefined) return null;
  return (
    <aside className="nt-consent-slot" aria-label="Cookie consent" style={{ background: tokens.surface.inverse, color: tokens.text.onInverse, padding: raw.space.s4, fontFamily: raw.type.familyText }}>
      <Container>{children}</Container>
    </aside>
  );
}
