/**
 * Storage adapters for the consent record.
 *
 * The record is a legal artefact, so the interesting behaviour is not the happy path — it is what
 * happens when storage is unavailable. Safari private mode throws on `setItem` (not on `getItem`),
 * a full quota throws, an extension can replace `localStorage` with something that throws on
 * property access, and a server render has no `window` at all. In every one of those cases the
 * answer is the same: the write reports failure and the read reports absence, which the record layer
 * turns into the denying state. An adapter that swallowed a *successful* refusal to persist is the
 * bug this file exists to prevent, because the buyer would believe they had consented and the app
 * would ask them again tomorrow.
 */
import type { ConsentStorage } from './types.js';

/** Everything the record layer needs from a key/value store, in one injectable object. */
export function memoryStorage(initial: Record<string, string> = {}): ConsentStorage & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    read(key) {
      const v = map.get(key);
      return v === undefined ? null : v;
    },
    write(key, value) {
      if (typeof value !== 'string') return false;
      map.set(key, value);
      return true;
    },
    remove(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map);
    },
  };
}

/**
 * `window.localStorage` / `sessionStorage` behind the same safe contract. `scope` decides which one:
 * the consent *record* is persisted (a buyer's refusal must survive a reload — re-asking and hoping
 * for a different answer is a dark pattern), while anything session-scoped belongs to `session.ts`.
 */
export interface WebStorageOptions {
  readonly scope: 'local' | 'session';
  /** Injectable for tests and for the app shell, which owns the window. */
  readonly getWindow?: () => (Window & typeof globalThis) | null;
}

export function webStorage(options: WebStorageOptions): ConsentStorage {
  const grab = (): Storage | null => {
    try {
      // A supplied getter IS the source of truth: `() => null` means "there is no window here", and
      // must not fall through to the ambient one. `??` did exactly that, so an injected null window
      // silently read the real storage whenever another test file had already installed a global.
      const win =
        options.getWindow !== undefined
          ? options.getWindow()
          : (globalThis as { window?: Window & typeof globalThis }).window;
      const store = win?.[options.scope === 'local' ? 'localStorage' : 'sessionStorage'];
      if (!store) return null;
      // Touch it once: some browsers expose the object and throw on first access when blocked.
      const probe = '__ntm_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch {
      return null;
    }
  };

  return {
    read(key) {
      try {
        return grab()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        const store = grab();
        if (!store) return false;
        store.setItem(key, value);
        return true;
      } catch {
        // Quota exceeded or private mode. The caller keeps the in-memory record for this page load
        // and reports the failure; it does not tell the buyer their choice was saved.
        return false;
      }
    },
    remove(key) {
      try {
        grab()?.removeItem(key);
      } catch {
        /* nothing to do: absence is the state we wanted anyway */
      }
    },
  };
}

/**
 * A storage that always fails, for the "consent cannot be persisted" path in tests and in the
 * no-storage fallback render. Named rather than inlined so a test can assert the UI behaves
 * differently when a saved choice will not survive a reload — which it must not treat as success.
 */
export function unavailableStorage(): ConsentStorage {
  return {
    read: () => null,
    write: () => false,
    remove: () => {},
  };
}
