import type { ReactNode } from 'react';
import type { RouteDef } from '../router.js';
import type { StaffSession } from '../shell/session.js';
import { remainingSessionMs } from '../shell/session.js';
import { roleLabel } from '../shell/role.js';
import { formatDuration } from '../shell/time.js';
import type { Density } from '../lib/table-prefs.js';

export interface TopBarProps {
  readonly session: StaffSession | null;
  readonly route: RouteDef;
  readonly nowIso: string;
  readonly density: Density;
  readonly paletteOpen: boolean;
  readonly onToggleDensity: () => void;
  readonly onOpenCommands: () => void;
  readonly actions?: ReactNode;
}

/**
 * Chrome, not identity. The name and role come from the session the server issued; there is no local
 * "current user" state that could disagree with the capability list beside it. The critical chip is
 * a fact about the route class, not a warning that can be dismissed.
 */
export function TopBar({
  session,
  route,
  nowIso,
  density,
  paletteOpen,
  onToggleDensity,
  onOpenCommands,
  actions,
}: TopBarProps) {
  return (
    <header className="ops-topbar">
      <span className="ops-brand">NasTech Operations</span>
      {/* The chip warns the operator before they act on a money screen. An anonymous visitor cannot
          act on anything here, so the only thing it could do is confirm that the URL it probed is a
          critical staff surface — which is a fact about the route table, not about the session. */}
      {session === null || route.class !== 'critical' ? null : (
        <span className="ops-chip ops-chip-critical" data-testid="critical-chip">
          Critical surface
        </span>
      )}
      <div className="ops-topbar-identity">
        {session === null ? (
          <span data-testid="who-am-i">Not signed in</span>
        ) : (
          <>
            <span data-testid="who-am-i">{session.displayName}</span>
            <span className="ops-topbar-meta">{roleLabel(session.role)}</span>
            <span className="ops-topbar-meta" data-testid="session-remaining">
              Session ends in {formatDuration(remainingSessionMs(session, nowIso))}
            </span>
            {session.mfaSatisfied ? null : <span className="ops-chip">MFA pending</span>}
          </>
        )}
      </div>
      <div className="ops-topbar-actions">
        <button
          type="button"
          className="ops-button ops-button-quiet"
          aria-pressed={density === 'compact'}
          onClick={onToggleDensity}
        >
          Compact rows
        </button>
        <button
          type="button"
          className="ops-button ops-button-quiet"
          aria-haspopup="dialog"
          aria-expanded={paletteOpen}
          aria-keyshortcuts="?"
          onClick={onOpenCommands}
        >
          Commands
        </button>
        {actions}
      </div>
    </header>
  );
}
