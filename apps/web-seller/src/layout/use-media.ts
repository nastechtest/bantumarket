import { useCallback, useSyncExternalStore } from 'react';
import { DESKTOP_QUERY } from './breakpoints.js';

/**
 * matchMedia as an external store. `useSyncExternalStore` is required because a MediaQueryList
 * change does not produce a new snapshot object; `useState` + a manual listener goes stale.
 * The server snapshot is chosen by the caller (default: compact), so the chrome never guesses
 * a desktop layout it cannot see.
 */
export function useMediaQuery(query: string, serverMatch = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const media = window.matchMedia(query);
      media.addEventListener('change', onStoreChange);
      return () => media.removeEventListener('change', onStoreChange);
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
