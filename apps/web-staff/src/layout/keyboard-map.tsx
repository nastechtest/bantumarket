import { useEffect } from 'react';
import type { StaffSession } from '../shell/session.js';
import { visibleNavItems } from '../nav/nav-model.js';
import { navigate } from '../router.js';

export interface NavShortcut {
  readonly chord: string;
  readonly path: string;
}

/**
 * Two-key chords, not single letters: a console is full of single-letter controls and browser
 * quick-find, and `g` prefixes the destination the way the nav groups read. Every destination is
 * looked up in the visible nav model at press time, so a shortcut cannot outlive the permission
 * that made it valid.
 */
export const NAV_SHORTCUTS: readonly NavShortcut[] = [
  { chord: 'g q', path: '/' },
  { chord: 'g d', path: '/disputes' },
  { chord: 'g r', path: '/risk' },
  { chord: 'g c', path: '/capture-ops' },
  { chord: 'g t', path: '/taxonomy' },
  { chord: 'g m', path: '/reconciliation' },
  { chord: 'g p', path: '/payouts' },
  { chord: 'g a', path: '/audit' },
  { chord: 'g u', path: '/users' },
  { chord: 'g i', path: '/requests' },
];

const CHORD_TIMEOUT_MS = 1500;

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function ConsoleShortcuts({
  session,
  nowIso,
  enabled,
  onOpenPalette,
}: {
  session: StaffSession | null;
  nowIso: string;
  enabled: boolean;
  onOpenPalette: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    let armed = false;
    let timer: number | null = null;

    const disarm = () => {
      armed = false;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === '?') {
        event.preventDefault();
        disarm();
        onOpenPalette();
        return;
      }

      if (armed) {
        disarm();
        const chord = `g ${event.key.toLowerCase()}`;
        const shortcut = NAV_SHORTCUTS.find((candidate) => candidate.chord === chord);
        if (shortcut === undefined) return;
        const visible = new Set(visibleNavItems(session, nowIso).map((item) => item.path));
        if (!visible.has(shortcut.path)) return;
        event.preventDefault();
        navigate(shortcut.path);
        return;
      }

      if (event.key.toLowerCase() === 'g' && !event.shiftKey) {
        armed = true;
        timer = window.setTimeout(disarm, CHORD_TIMEOUT_MS);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      disarm();
    };
  }, [enabled, session, nowIso, onOpenPalette]);

  return null;
}
