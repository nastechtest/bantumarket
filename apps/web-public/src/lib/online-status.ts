import { useCallback, useSyncExternalStore } from 'react';

/**
 * Online status — the honesty layer of the shell.
 *
 * Two rules this file exists to enforce:
 *   1. `navigator.onLine` is a *reachability hint*, not a verdict (airplane mode is accurate;
 *      a captive Wi-Fi login page says "online" while everything 404s). So the store is fed by
 *      events AND may be corrected by any real request that failed — `set(false)` is allowed
 *      from the transport layer, `set(true)` only means "a probe succeeded".
 *   2. Being offline never queues a payment. The buy affordance is *disabled with a reason*,
 *      and the reason strings live here so every surface says the same true thing.
 */

export interface OnlineSource {
  initial(): boolean;
  subscribe(handler: (online: boolean) => void): () => void;
}

/** Browser wiring, guarded so the module is importable in tests and pre-render. */
export function browserOnlineSource(): OnlineSource {
  return {
    initial() {
      if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
      return navigator.onLine;
    },
    subscribe(handler) {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return () => {};
      }
      const on = () => handler(true);
      const off = () => handler(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => {
        window.removeEventListener('online', on);
        window.removeEventListener('offline', off);
      };
    },
  };
}

export interface OnlineStore {
  get(): boolean;
  /** Snapshot for server/first render; never guesses "offline" from a missing signal. */
  getServer(): boolean;
  subscribe(listener: () => void): () => void;
  /** Fed by events or a failed probe. See header comment before calling with `true`. */
  set(online: boolean): void;
  dispose(): void;
}

export function createOnlineStore(source: OnlineSource): OnlineStore {
  const listeners = new Set<() => void>();
  let value = source.initial();
  let teardown: (() => void) | null = null;
  let disposed = false;

  return {
    get: () => value,
    getServer: () => value,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      // Lazy: a shell that nobody subscribed to should not hold window listeners.
      if (teardown === null) {
        teardown = source.subscribe((next) => {
          if (next === value) return;
          value = next;
          for (const l of listeners) l();
        });
      }
      return () => {
        listeners.delete(listener);
      };
    },
    set(online) {
      if (online === value) return;
      value = online;
      for (const l of listeners) l();
    },
    dispose() {
      disposed = true;
      if (teardown !== null) {
        teardown();
        teardown = null;
      }
      listeners.clear();
    },
  };
}

export const appOnlineStore = createOnlineStore(browserOnlineSource());

export function useOnlineStatus(store: OnlineStore = appOnlineStore): boolean {
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  return useSyncExternalStore(
    subscribe,
    () => store.get(),
    () => store.getServer(),
  );
}

export const OFFLINE_HEADLINE = 'You are offline';

export function offlineBannerCopy(online: boolean): string | null {
  if (online) return null;
  return `${OFFLINE_HEADLINE}. This page is still readable from your device, but prices and availability are from the last time you were connected — trust them accordingly.`;
}

/**
 * Why the buy button is off. Returns null online; offline, a full sentence a buyer (and a
 * court, later) can read: nothing was queued, nothing was silently retried.
 */
export function buyDisabledReason(online: boolean): string | null {
  if (online) return null;
  return `${OFFLINE_HEADLINE} — buying is disabled until your connection returns. We do not queue or retry payments while you are offline.`;
}
