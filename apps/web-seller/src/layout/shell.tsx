import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useRouteTransition } from '@nastech/motion';
import type { RouteDef } from '../router.js';
import { activeNavPath, deriveNav } from '../nav/nav-items.js';
import { routeMotionPolicy } from '../nav/route-policy.js';
import type { SellerSessionStore } from '../lib/session.js';
import { useSellerSession } from '../lib/session.js';
import { offlineNotice, useOnlineStatus, type OnlineStore } from '../lib/online.js';
import { appOnlineStore } from '../lib/online.js';
import { documentTitleFor } from '../lib/format.js';
import type { SupportContact } from '../lib/support.js';
import { Footer } from './footer.js';
import { MobileNav } from './mobile-nav.js';
import { RouteGate } from './route-gate.js';
import { SideNav } from './side-nav.js';
import { TopBar } from './_top-bar.js';

export interface AppShellProps {
  readonly route: RouteDef;
  /** The concrete pathname (params resolved), not the route pattern. */
  readonly activePath: string;
  readonly routes: readonly RouteDef[];
  readonly sessionStore: SellerSessionStore;
  readonly navigate: (path: string) => void;
  readonly onSignOut: () => void;
  readonly support: SupportContact | null;
  readonly onlineStore?: OnlineStore;
  readonly children: ReactNode;
}

/**
 * The one shell every seller route renders inside.
 *
 * DOM order is the accessibility order: skip link, header, navigation, main, footer. The
 * skip link is first because it is the first tab stop; `<main>` appears exactly once and is
 * the skip target. Navigation is derived from the router's table (`deriveNav`), never a list
 * here. Guarding is by route class inside `RouteGate`, so a critical route added to the table
 * is gated without this file changing.
 */
export function AppShell({
  route,
  activePath,
  routes,
  sessionStore,
  navigate,
  onSignOut,
  support,
  onlineStore = appOnlineStore,
  children,
}: AppShellProps) {
  const session = useSellerSession(sessionStore);
  const online = useOnlineStatus(onlineStore);
  const nav = useMemo(() => deriveNav(routes), [routes]);
  const active = activeNavPath(activePath, nav.items);
  const transition = useRouteTransition(activePath);
  const motion = routeMotionPolicy(route);
  const notice = offlineNotice(online);

  const previousPath = useRef(activePath);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = documentTitleFor(route.label);
  }, [route.label]);

  useEffect(() => {
    if (previousPath.current === activePath) return;
    previousPath.current = activePath;
    if (typeof document === 'undefined') return;
    document.getElementById('nt-main')?.focus();
  }, [activePath]);

  return (
    <div className="nt-shell">
      <a className="nt-skip-link" href="#nt-main">
        Skip to content
      </a>
      <TopBar session={session} onSignOut={onSignOut} />
      <div className="nt-shell__frame">
        <SideNav items={nav.items} activePath={active} />
        <div className="nt-shell__column">
          <MobileNav items={nav.items} activePath={active} />
          {notice === null ? null : (
            <div className="nt-offline" role="status" aria-live="polite">
              <p className="nt-offline__text">{notice}</p>
            </div>
          )}
          <main id="nt-main" className="nt-main" tabIndex={-1}>
            <div
              className="nt-route"
              data-motion={motion.animate ? transition.phase : 'none'}
              data-route-class={route.class}
            >
              <RouteGate
                route={route}
                session={session}
                activePath={activePath}
                navigate={navigate}
              >
                {children}
              </RouteGate>
            </div>
          </main>
          <Footer support={support} />
        </div>
      </div>
    </div>
  );
}
