import type { VerificationTier } from '@nastech/api-contracts';

/**
 * The seller session, and the one storage key every part of this app reads.
 *
 * It lives here (features/auth) because brief 59 owns auth; the shell (brief 56) may read the same
 * key through its own helper, but there is exactly one key and one shape. A `critical` page that
 * finds no valid session must refuse to render its money surface — it checks storage rather than
 * importing this module, which keeps feature isolation intact.
 */

export const SESSION_STORAGE_KEY = 'nastech.seller.session.v1';
export const SESSION_EVENT = 'nastech:seller-session';

export interface SellerSession {
  readonly sellerId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly tier: VerificationTier;
  readonly signedInAt: string;
  /** Absolute instant. An expired session is treated as no session, never silently refreshed. */
  readonly expiresAt: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const TIERS: readonly VerificationTier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];

export function isSellerSession(value: unknown): value is SellerSession {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.sellerId === 'string' &&
    s.sellerId.length > 0 &&
    typeof s.displayName === 'string' &&
    (s.email === null || typeof s.email === 'string') &&
    (s.phone === null || typeof s.phone === 'string') &&
    typeof s.tier === 'string' &&
    TIERS.includes(s.tier as VerificationTier) &&
    typeof s.signedInAt === 'string' &&
    typeof s.expiresAt === 'string'
  );
}

/** Expiry is compared as instants; an unparseable expiry is expired, not valid-forever. */
export function isSessionLive(session: SellerSession, now: Date = new Date()): boolean {
  const expires = Date.parse(session.expiresAt);
  return Number.isFinite(expires) && expires > now.getTime();
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Safari private mode throws on storage access; a session is not worth crashing the app.
    return null;
  }
}

export function readSellerSession(store: KeyValueStore | null = defaultStore(), now: Date = new Date()): SellerSession | null {
  if (store === null) return null;
  const raw = store.getItem(SESSION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSellerSession(parsed) || !isSessionLive(parsed, now)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSellerSession(session: SellerSession, store: KeyValueStore | null = defaultStore()): void {
  if (store === null) return;
  store.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  notifySessionChanged();
}

/** Clears the session and any stored return path. Never throws. */
export function clearSellerSession(store: KeyValueStore | null = defaultStore()): void {
  if (store === null) return;
  store.removeItem(SESSION_STORAGE_KEY);
  store.removeItem('nastech.seller.returnTo');
  notifySessionChanged();
}

function notifySessionChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(SESSION_EVENT));
  }
}

export function subscribeSession(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === null || key === undefined || key === SESSION_STORAGE_KEY) listener();
  };
  window.addEventListener(SESSION_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(SESSION_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** In-memory store for tests and for the no-storage fallback. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}
