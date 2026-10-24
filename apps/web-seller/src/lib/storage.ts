/**
 * Storage that is total at the call site. Private-browsing mode, a full quota and a disabled
 * storage policy all present as exceptions from the browser API; none of them may take a
 * seller's screen down, so every access falls back to memory and every JSON write reports
 * whether it landed.
 */

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKeyValues(seed: Readonly<Record<string, string>> = {}): KeyValueStore {
  const values = new Map<string, string>(Object.entries(seed));
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}

export type StorageKind = 'local' | 'session';

function storageFrom(root: Window, kind: StorageKind): Storage {
  return kind === 'local' ? root.localStorage : root.sessionStorage;
}

/**
 * The browser's storage when it can be touched, memory when it cannot. The memory fallback is
 * deliberately per-call: it keeps the current screen working, not the data, because the browser
 * has told us that persistence is not available.
 */
export function browserKeyValues(
  kind: StorageKind = 'local',
  root: Window | undefined = typeof window === 'undefined' ? undefined : window,
): KeyValueStore {
  if (root === undefined) return memoryKeyValues();
  try {
    const storage = storageFrom(root, kind);
    const probe = '__nastech_seller_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return {
      get: (key) => storage.getItem(key),
      set: (key, value) => storage.setItem(key, value),
      remove: (key) => storage.removeItem(key),
    };
  } catch {
    return memoryKeyValues();
  }
}

export function readJson<T>(
  store: KeyValueStore,
  key: string,
  parse: (value: unknown) => T | null,
): T | null {
  const raw = store.get(key);
  if (raw === null) return null;
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** False when the value could not be serialised or stored; callers decide what to tell the seller. */
export function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
