import type { KeyValueBackend } from './storage.js';

/**
 * Cross-tab messaging for the shell (sign-in state, flag flips, "another tab completed the
 * handover"). BroadcastChannel where it exists; a storage-event backend where it doesn't,
 * because the fallback has to be tested behaviour, not a comment that says "works in Safari".
 *
 * Both backends share the envelope rules: ignore your own sender id, ignore foreign keys and
 * malformed payloads silently (a corrupted message from *another page on this origin* is a
 * reason to drop the message, not to throw in the buyer's face).
 */

export interface MessageBus<T> {
  post(message: T): void;
  subscribe(handler: (message: T) => void): () => void;
  close(): void;
}

export interface ChannelLike {
  postMessage(data: unknown): void;
  close(): void;
  /** The DOM's own handler shape — a live `BroadcastChannel` satisfies this interface as written. */
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

export interface StorageBusBackend extends KeyValueBackend {
  /** Fires with the changed key when *another* document writes; the `storage` event shape. */
  subscribeKeys(handler: (key: string) => void): () => void;
}

interface Envelope {
  readonly sender: string;
  readonly payload: unknown;
}

let idCounter = 0;
function selfId(): string {
  idCounter += 1;
  return `bus-${idCounter}`;
}

export interface BusDeps {
  channel?: (name: string) => ChannelLike | null;
  storage?: StorageBusBackend | null;
  id?: string;
}

function defaultChannelFactory(name: string): ChannelLike | null {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return null;
  return new window.BroadcastChannel(`nt:${name}`);
}

function defaultStorageBackend(): StorageBusBackend | null {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return null;
  let raw: Storage;
  try {
    const candidate = window.localStorage;
    if (!candidate) return null;
    raw = candidate;
  } catch {
    return null;
  }
  return {
    // Bound calls: Storage.prototype methods throw "Illegal invocation" on a copied receiver.
    getItem: (key) => raw.getItem(key),
    setItem: (key, value) => {
      raw.setItem(key, value);
    },
    removeItem: (key) => raw.removeItem(key),
    subscribeKeys(handler) {
      const cb = (event: StorageEvent) => {
        if (event.key) handler(event.key);
      };
      window.addEventListener('storage', cb);
      return () => window.removeEventListener('storage', cb);
    },
  };
}

export function createBus<T>(name: string, deps: BusDeps = {}): MessageBus<T> {
  const id = deps.id ?? selfId();
  const handlers = new Set<(message: T) => void>();
  let closed = false;

  const channelFactory = deps.channel ?? defaultChannelFactory;
  // Transport selection is per-result, not per-option: a channel *factory* that yields null
  // (older engine) must still fall through to the storage backend.
  const channel = channelFactory(name);
  const storage = channel === null ? (deps.storage !== undefined ? deps.storage : defaultStorageBackend()) : null;

  let keyListener: (() => void) | null = null;
  const storageKey = `nt.bus.${name}`;

  function deliver(env: Envelope | null) {
    if (closed || !env || env.sender === id) return;
    for (const h of handlers) h(env.payload as T);
  }

  if (channel) {
    channel.onmessage = (event) => {
      const data = event.data as { env?: Envelope } | null;
      deliver(data && typeof data === 'object' && 'env' in data ? (data.env as Envelope) : null);
    };
  } else if (storage) {
    keyListener = storage.subscribeKeys((changed) => {
      if (changed !== storageKey) return;
      const raw = storage.getItem(storageKey);
      if (!raw) return;
      try {
        deliver(JSON.parse(raw) as Envelope);
      } catch {
        // malformed: drop it, per the header.
      }
    });
  }

  return {
    post(message) {
      if (closed) return;
      const env: Envelope = { sender: id, payload: message };
      if (channel) {
        try {
          channel.postMessage({ env });
        } catch {
          // postMessage can throw on unserialisable payloads; shell messages never should,
          // and a bus that takes the app down over one is worse than a dropped ping.
        }
      } else if (storage) {
        try {
          storage.setItem(storageKey, JSON.stringify(env));
        } catch {
          // quota/private mode: message lost, tabs keep working.
        }
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      closed = true;
      handlers.clear();
      if (channel) channel.close();
      if (keyListener) keyListener();
      keyListener = null;
    },
  };
}
