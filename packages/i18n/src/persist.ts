/**
 * Persist the chosen locale.
 *
 * A buyer who selects isiZulu stays in isiZulu across reloads. `localStorage` is the browser store,
 * but the read/write are behind a tiny `StorageLike` seam so a test (or a React Native / SSR host)
 * can inject an in-memory store, and so a private-mode Safari that throws on `setItem` degrades to a
 * no-op instead of breaking the language switcher.
 *
 * The stored value is normalised on read: a stale `en-GB` or a typo falls back to null rather than
 * producing an unregistered locale. We persist the base `Locale`, not a region tag, matching the key
 * space in `locale.ts`.
 */

import { normalizeLocale, type Locale } from './locale.js';

export const LOCALE_STORAGE_KEY = 'nastech.locale';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The ambient `localStorage`, or null off-browser / when access throws (Safari private mode). */
function ambientStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/** Read the saved locale. Returns null when nothing valid is stored. Never throws. */
export function loadLocale(storage: StorageLike | null = ambientStorage()): Locale | null {
  if (!storage) return null;
  try {
    return normalizeLocale(storage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist the locale. Returns true when it actually wrote, false when storage is unavailable/threw. */
export function saveLocale(locale: Locale, storage: StorageLike | null = ambientStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

/** Forget the saved choice (a "reset to detected" control, and for tests). */
export function clearLocale(storage: StorageLike | null = ambientStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** A simple in-memory `StorageLike`, exported so tests and non-browser hosts do not fake `window`. */
export function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}
