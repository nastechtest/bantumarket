/**
 * Namespaced key-value storage with an honest failure mode.
 *
 * The browser can refuse storage at any moment (private mode, quota, disabled cookies), and the
 * shell must never crash for it — a buyer losing their tab-bar preference is not a buyer losing
 * their order. So: every operation is total (no throw), `set` reports failure as `false`, and a
 * missing backend silently degrades to per-tab memory. Memory degradation is visible to callers
 * via `persistent`, so anything load-bearing (nothing in the shell is) can refuse to use us.
 */

export interface KeyValueBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MemoryBackend extends KeyValueBackend {
  /** Test/dev hook: inspect what "would have" persisted. */
  dump(): Record<string, string>;
}

export function memoryBackend(): MemoryBackend {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

/** Probe once: Safari private mode throws on *write*, not on access. */
export function browserBackend(kind: 'local' | 'session'): KeyValueBackend | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window[`${kind}Storage`];
    if (!raw) return null;
    const probe = 'nt.probe';
    raw.setItem(probe, '1');
    raw.removeItem(probe);
    return raw;
  } catch {
    return null;
  }
}

export interface NamespacedStorage {
  readonly persistent: boolean;
  getString(key: string): string | null;
  /** JSON parse is total: corrupt data reads as absent, and the key stays until overwritten. */
  getJson<T>(key: string): { value: T } | null;
  setString(key: string, value: string): boolean;
  setJson(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export function createStorage(namespace: string, backend: KeyValueBackend | null): NamespacedStorage {
  const safe: KeyValueBackend = backend ?? memoryBackend();
  const key = (k: string) => `${namespace}:${k}`;
  return {
    persistent: backend !== null,
    getString: (k) => {
      try {
        return safe.getItem(key(k));
      } catch {
        return null;
      }
    },
    getJson<T>(k: string): { value: T } | null {
      const text = this.getString(k);
      if (text === null) return null;
      try {
        return { value: JSON.parse(text) as T };
      } catch {
        return null;
      }
    },
    setString(k, v) {
      try {
        safe.setItem(key(k), v);
        return true;
      } catch {
        return false;
      }
    },
    setJson(k, v) {
      let text: string;
      try {
        text = JSON.stringify(v);
      } catch {
        return false; // circular or non-serialisable: caller's problem, not our crash
      }
      return this.setString(k, text);
    },
    remove(k) {
      try {
        safe.removeItem(key(k));
      } catch {
        // ignore: removal from a dying store is, at worst, stale data
      }
    },
  };
}

export const appStorage = createStorage('nt.web', browserBackend('local'));
