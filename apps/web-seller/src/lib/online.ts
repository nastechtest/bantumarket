import { useCallback, useSyncExternalStore } from 'react';

/**
 * Online status, as a store rather than a component-local event listener.
 *
 * `navigator.onLine` is a reachability hint: a captive portal reports "online" while everything
 * fails. So the events are the input, `set()` is the correction a failed request may apply, and
 * no caller treats a `true` snapshot as proof that anything was delivered.
 */

export interface OnlineSource {
  initial(): boolean;
  subscribe(handler: (online: boolean) => void): () => void;
}

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
      const online = () => handler(true);
      const offline = () => handler(false);
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      return () => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      };
    },
  };
}

export interface OnlineStore {
  get(): boolean;
  getServer(): boolean;
  subscribe(listener: () => void): () => void;
  set(online: boolean): void;
  dispose(): void;
}

export function createOnlineStore(source: OnlineSource): OnlineStore {
  let value = source.initial();
  let teardown: (() => void) | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    getServer: () => value,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      if (teardown === null) {
        teardown = source.subscribe((next) => {
          if (next === value || disposed) return;
          value = next;
          for (const l of listeners) l();
        });
      }
      return () => {
        listeners.delete(listener);
      };
    },
    set(online) {
      if (disposed || online === value) return;
      value = online;
      for (const listener of listeners) listener();
    },
    dispose() {
      disposed = true;
      teardown?.();
      teardown = null;
      listeners.clear();
    },
  };
}

export const appOnlineStore = createOnlineStore(browserOnlineSource());

export function useOnlineStatus(store: OnlineStore = appOnlineStore): boolean {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  return useSyncExternalStore(
    subscribe,
    () => store.get(),
    () => store.getServer(),
  );
}

export const OFFLINE_HEADLINE = 'You are offline';

export function offlineNotice(online: boolean): string | null {
  if (online) return null;
  return `${OFFLINE_HEADLINE}. This screen is showing the last information your device received, so a price or order state may have moved on. Nothing is being sent while the connection is down — do not change bank or payout details until you are back online.`;
}
