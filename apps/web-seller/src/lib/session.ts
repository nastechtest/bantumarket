import { useCallback, useSyncExternalStore } from 'react';
import type { VerificationTier } from '@nastech/api-contracts';

/**
 * The session *contract* the shell gates on. Resolving it — OTP, token refresh, the sign-out
 * request — belongs to features/auth; this module deliberately has no transport and never
 * fabricates a signed-in seller.
 *
 * CONTRACT-GAP: session resolution and sign-out transport, from brief 59 `features/auth`. The
 * feature calls `store.set(...)`; the shell only reads the resulting state.
 */

export interface SellerProfile {
  readonly sellerId: string;
  readonly displayName: string;
  readonly tier: VerificationTier;
}

export type SellerSessionState =
  /** The server has not answered yet. Protected content must not render in this state. */
  | { readonly status: 'checking' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticated'; readonly seller: SellerProfile };

export interface SellerSessionStore {
  get(): SellerSessionState;
  getServer(): SellerSessionState;
  subscribe(listener: () => void): () => void;
  set(next: SellerSessionState): void;
  dispose(): void;
}

export function createSellerSessionStore(
  initial: SellerSessionState = { status: 'checking' },
): SellerSessionStore {
  let state = initial;
  let disposed = false;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    getServer: () => state,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      if (disposed || next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}

export function useSellerSession(store: SellerSessionStore): SellerSessionState {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  return useSyncExternalStore(
    subscribe,
    () => store.get(),
    () => store.getServer(),
  );
}

export function authenticatedSeller(state: SellerSessionState): SellerProfile | null {
  return state.status === 'authenticated' ? state.seller : null;
}
