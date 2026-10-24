import type { AuthTransport } from './api/auth-transport.js';
import { clearSellerSession, type KeyValueStore, type SellerSession } from './session.js';

/**
 * Sign-out clears this device first and tells the server second. A seller on a borrowed phone
 * must be able to get out even with no signal; the server-side revocation is retried by the next
 * session and its failure is reported to the caller rather than swallowed.
 */

export interface SignOutResult {
  readonly clearedLocally: true;
  readonly serverNotified: boolean;
  /** Seller-readable sentence when the server was not told; null on full success. */
  readonly warning: string | null;
}

export interface SignOutDeps {
  readonly transport?: Pick<AuthTransport, 'signOut'>;
  readonly store?: KeyValueStore | null;
  readonly navigateTo?: (path: string) => void;
}

export async function signOut(session: SellerSession | null, deps: SignOutDeps = {}): Promise<SignOutResult> {
  clearSellerSession(deps.store === undefined ? undefined : deps.store);
  let serverNotified = false;
  let warning: string | null = null;
  if (session !== null && deps.transport !== undefined) {
    try {
      await deps.transport.signOut(session);
      serverNotified = true;
    } catch {
      warning = 'You are signed out on this device. We could not reach NasTech to end the session everywhere — do that from Settings when you have signal.';
    }
  }
  deps.navigateTo?.('/sign-in');
  return { clearedLocally: true, serverNotified, warning };
}
