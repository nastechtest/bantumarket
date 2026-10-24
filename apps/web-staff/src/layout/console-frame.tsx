import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RouteDef } from '../router.js';
import type { StaffSession } from '../shell/session.js';
import { impersonationExpired, isImpersonating, isSessionExpired } from '../shell/session.js';
import { capabilityForPath } from '../shell/permissions.js';
import { decideAccess } from '../nav/access.js';
import type { AccessDenialReason } from '../nav/access.js';
import { buildNavModel } from '../nav/nav-model.js';
import { useDensity } from './density-toggle.js';
import { useNow } from '../lib/use-now.js';
import { AccessState } from './chrome-states.js';
import { Breadcrumbs } from './breadcrumbs.js';
import { CommandPalette } from './command-palette.js';
import { ImpersonationBanner } from './impersonation-banner.js';
import { ConsoleShortcuts } from './keyboard-map.js';
import { SideNav } from './side-nav.js';
import { TopBar } from './top-bar.js';

export interface ConsoleFrameProps {
  readonly route: RouteDef;
  readonly session: StaffSession | null;
  readonly children?: ReactNode;
  /** Auth-owned controls (sign out, end impersonation). Kept as a slot so the shell owns the place, not the policy. */
  readonly navFooter?: ReactNode;
  readonly actions?: ReactNode;
  /** Fixed clock for tests and audit screenshots; the live frame ticks every 30 seconds. */
  readonly now?: string;
}

type SessionState =
  | 'signed-out'
  | 'mfa-pending'
  | 'expired'
  | 'impersonation-ended'
  | 'impersonating'
  | 'active';

function sessionStateOf(session: StaffSession | null, nowIso: string): SessionState {
  if (session === null) return 'signed-out';
  if (isSessionExpired(session, nowIso)) return 'expired';
  if (!session.mfaSatisfied) return 'mfa-pending';
  if (session.impersonation !== null && impersonationExpired(session, nowIso)) return 'impersonation-ended';
  if (isImpersonating(session, nowIso)) return 'impersonating';
  return 'active';
}

/**
 * The one shell. It owns the only `<main>`, the only skip link and the only impersonation banner;
 * route pages render sections inside it. The page is not mounted at all when `decideAccess` refuses,
 * which is what keeps a refused payout screen from reaching its data layer or its lazy chunk.
 */
export function ConsoleFrame({ route, session, children, navFooter, actions, now }: ConsoleFrameProps) {
  const { density, toggle } = useDensity();
  const tick = useNow(30_000);
  const nowIso = now ?? tick;
  const [paletteOpen, setPaletteOpen] = useState(false);

  const decision = decideAccess(route, session, nowIso);
  const sections = buildNavModel(session, nowIso);
  const sessionState = sessionStateOf(session, nowIso);
  const deniedReason: AccessDenialReason | null = decision.allowed ? null : decision.reason;

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    setPaletteOpen(false);
  }, [route.path]);

  return (
    <div
      className="ops-shell"
      data-testid="staff-shell"
      data-density={density}
      data-route-class={route.class}
      data-session-state={sessionState}
    >
      <a className="ops-skip" href="#staff-main">
        Skip to main content
      </a>
      {session === null ? null : <ImpersonationBanner session={session} nowIso={nowIso} />}
      <TopBar
        session={session}
        route={route}
        nowIso={nowIso}
        density={density}
        paletteOpen={paletteOpen}
        onToggleDensity={toggle}
        onOpenCommands={openPalette}
        actions={actions}
      />
      <div className="ops-body">
        <SideNav
          sections={sections}
          currentPath={route.path}
          footer={navFooter}
          emptyMessage={
            session === null
              ? 'Sign in to see the console sections.'
              : 'No sections are available for this account.'
          }
        />
        <main id="staff-main" className="ops-main" tabIndex={-1}>
          {/* Withheld for an anonymous visitor: the trail names the screen it is located in, and a
              signed-out request that reaches `/payouts` is being refused — telling it "Money /
              Payout ops" hands a scanner the console's inventory for free. A session that exists but
              lacks the capability still gets the trail, because it is a staff member finding their
              way back. */}
          {session === null ? null : <Breadcrumbs route={route} />}
          {decision.allowed ? (
            children
          ) : (
            <AccessState reason={deniedReason ?? 'missing-capability'} capability={capabilityForPath(route.path)} />
          )}
        </main>
      </div>
      {paletteOpen ? (
        <CommandPalette items={sections.flatMap((section) => section.items)} onClose={closePalette} />
      ) : null}
      <ConsoleShortcuts
        session={session}
        nowIso={nowIso}
        enabled={!paletteOpen}
        onOpenPalette={openPalette}
      />
    </div>
  );
}
