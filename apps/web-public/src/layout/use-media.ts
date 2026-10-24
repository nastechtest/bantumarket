import { useCallback, useSyncExternalStore } from 'react';
import { DESKTOP_QUERY } from './breakpoints.js';

/**
 * matchMedia as a store. One subscription per query per component, torn down on unsubscribe;
 * `useSyncExternalStore` is required here precisely because a MediaQueryList change does not
 * produce a new object — naive `useState` + `addEventListener` re-renders on stale snapshots.
 *
 * Server/first render answers `serverMatch`, and callers choose it deliberately: the header
 * hides desktop nav when compact, so it passes `false` and lets the client correct after
 * hydration. A shell that guessed the *wrong* side here causes a visible layout jump; that is
 * the caller's choice to make per surface, not this hook's to hide.
 */
export function useMediaQuery(query: string, serverMatch = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return serverMatch;
      return window.matchMedia(query).matches;
    },
    () => serverMatch,
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, false);
}
