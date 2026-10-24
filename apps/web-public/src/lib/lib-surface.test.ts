import { describe, it, expect } from 'bun:test';
import { createStorage, memoryBackend, type KeyValueBackend } from './storage.js';
import { copyText } from './clipboard.js';
import { shareItem, type ShareApi } from './share.js';
import { createBus, type ChannelLike, type StorageBusBackend } from './broadcast-channel.js';
import { parseDeepLink, webPathToDeepLink, isSafeWebPath, DEEP_LINK_SCHEME } from './deep-links.js';

describe('namespaced storage', () => {
  it('namespaces keys and round-trips JSON', () => {
    const backend = memoryBackend();
    const store = createStorage('nt.web', backend);
    expect(store.setJson('tabbar', { hidden: true })).toBe(true);
    expect(store.getJson<{ hidden: boolean }>('tabbar')?.value.hidden).toBe(true);
    expect(Object.keys(backend.dump())).toEqual(['nt.web:tabbar']);
  });

  it('corrupt data reads as absent, and a throwing backend fails quietly instead of taking the render down', () => {
    const backend = memoryBackend();
    backend.setItem('nt.web:oops', '{not json');
    const store = createStorage('nt.web', backend);
    expect(store.getJson('oops')).toBeNull();

    const hostile: KeyValueBackend = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {
        throw new Error('nope');
      },
    };
    const degraded = createStorage('nt.web', hostile);
    expect(degraded.getString('anything')).toBeNull();
    // A configured-but-throwing backend reports failure; it does NOT silently masquerade as
    // working storage, and it does not crash the render.
    expect(degraded.setJson('k', { a: 1 })).toBe(false);
    expect(degraded.persistent).toBe(true);
  });

  it('no backend at all: everything works, persistent is false, nothing escapes to a crash', () => {
    const store = createStorage('nt.web', null);
    expect(store.persistent).toBe(false);
    expect(store.setJson('flag', 1)).toBe(true);
    expect(store.getJson('flag')?.value).toBe(1);
  });
});

describe('clipboard', () => {
  it('uses the async API when present', async () => {
    const writes: string[] = [];
    const result = await copyText('R4,200', { clipboard: { writeText: async (t) => void writes.push(t) } });
    expect(result).toEqual({ ok: true, via: 'clipboard-api' });
    expect(writes).toEqual(['R4,200']);
  });

  it('falls through to legacy when the API is blocked — and reports which one worked', async () => {
    const result = await copyText('share', {
      clipboard: {
        writeText: () => Promise.reject(new Error('NotAllowedError')),
      },
      legacyCopy: () => true,
    });
    expect(result).toEqual({ ok: true, via: 'legacy' });
  });

  it('never claims success it did not get', async () => {
    const result = await copyText('share', {
      clipboard: null,
      legacyCopy: () => false,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? result.via : result.reason).toBe('blocked-by-browser');
  });
});

describe('share', () => {
  it('native share wins', async () => {
    const calls: { title: string; url: string }[] = [];
    const share = Object.assign(
      async (d: { title: string; url: string }) => {
        calls.push(d);
      },
      { supported: true },
    ) as ShareApi;
    const outcome = await shareItem({ title: 'Seiko', url: 'https://nastech.market/item/lst_01' }, { share });
    expect(outcome).toEqual({ ok: true, via: 'native' });
    expect(calls.length).toBe(1);
  });

  it('a dismissed picker is `cancelled`, not a failure and not a lie', async () => {
    const share = Object.assign(
      () => Promise.reject(new DOMException('user dismissed', 'AbortError')),
      { supported: true },
    ) as ShareApi;
    const outcome = await shareItem({ title: 'Seiko', url: 'https://x/' }, { share });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? '' : outcome.reason).toBe('cancelled');
  });

  it('no native API falls back to the clipboard result, honestly wrapped', async () => {
    const share = Object.assign(
      () => Promise.reject(new Error('unrelated')),
      { supported: true },
    ) as ShareApi;
    const outcome = await shareItem(
      { title: 'Seiko', url: 'https://nastech.market/item/lst_01' },
      { share, clipboard: { clipboard: { writeText: async () => {} } } },
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.via === 'clipboard' ? outcome.detail.via : '').toBe('clipboard-api');
  });
});

describe('message bus', () => {
  it('BroadcastChannel path delivers and unsubscribes', () => {
    let listener: ((e: MessageEvent<unknown>) => void) | null = null;
    const posted: unknown[] = [];
    const channel: ChannelLike = {
      postMessage: (d) => void posted.push(d),
      close: () => {},
      set onmessage(h) {
        listener = h;
      },
      get onmessage() {
        return listener;
      },
    };
    const bus = createBus<{ n: number }>('x', { channel: () => channel, id: 'a' });
    const seen: number[] = [];
    const off = bus.subscribe((m) => void seen.push(m.n));
    // A message as another tab's engine would hand it over. It goes through a function for two
    // reasons: that is the shape the bus is called with, and this scope still narrows `listener` to
    // null because the setter runs later — a real event object is not the point of this test.
    const fromTab = (sender: string, n: number): void => {
      listener?.({ data: { env: { sender, payload: { n } } } } as unknown as MessageEvent<unknown>);
    };
    fromTab('b', 7);
    expect(seen).toEqual([7]);
    fromTab('a', 8); // our own echo is ignored
    expect(seen).toEqual([7]);
    off();
    fromTab('b', 9);
    expect(seen).toEqual([7]);
    bus.post({ n: 1 });
    expect(posted.length).toBe(1);
  });

  it('storage fallback: two buses on one backend talk; malformed and foreign keys are dropped', () => {
    const store = memoryBackend();
    const keyListeners = new Set<(key: string) => void>();
    const backend: StorageBusBackend = {
      ...store,
      subscribeKeys(h) {
        keyListeners.add(h);
        return () => keyListeners.delete(h);
      },
    };
    const a = createBus<string>('sync', { channel: () => null, storage: backend });
    const b = createBus<string>('sync', { channel: () => null, storage: backend });
    const got: string[] = [];
    b.subscribe((m) => void got.push(m));

    a.post('handover-done');
    for (const h of keyListeners) h('nt.bus.sync');
    expect(got).toEqual(['handover-done']);

    // a sender id collision (same tab re-created bus with same id) must not echo to self
    const dup = createBus<string>('sync', { channel: () => null, storage: backend, id: 'fixed' });
    const dupGot: string[] = [];
    dup.subscribe((m) => void dupGot.push(m));
    store.setItem('nt.bus.sync', JSON.stringify({ sender: 'fixed', payload: 'self-echo' }));
    for (const h of keyListeners) h('nt.bus.sync');
    expect(dupGot).toEqual([]);

    store.setItem('nt.bus.sync', 'broken json {{');
    for (const h of keyListeners) h('nt.bus.sync');
    expect(dupGot).toEqual([]);
    for (const h of keyListeners) h('other.key');
    // 'self-echo' was legitimately delivered to a/b (foreign sender); the malformed write was not.
    expect(got).toEqual(['handover-done', 'self-echo']);
  });
});

describe('deep links', () => {
  it('round-trips a legitimate item link', () => {
    const parsed = parseDeepLink(`${DEEP_LINK_SCHEME}://item/lst_01`);
    expect(parsed).not.toBeNull();
    expect(parsed!.path).toBe('/item/lst_01');
    expect(webPathToDeepLink('/item/lst_01')).toBe(`${DEEP_LINK_SCHEME}://item/lst_01`);
  });

  it('refuses every shape that could hide a redirect or a traversal', () => {
    expect(parseDeepLink('https://nastech.market/item/lst_01')).toBeNull(); // not our scheme
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://evil.com/`)).toBeNull(); // dot in segment
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://../etc/passwd`)).toBeNull(); // traversal
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}:///absolute`)).toBeNull(); // empty host
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://item/lst_01#frag`)).toBeNull(); // fragment
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://item/%00x`)).toBeNull(); // encoded control
    expect(parseDeepLink(`${DEEP_LINK_SCHEME}://a?k=1&k=2`)).toBeNull(); // duplicate keys
  });

  it('accepts one safe query parameter and preserves it', () => {
    const parsed = parseDeepLink(`${DEEP_LINK_SCHEME}://handover/orr_01?token=abc-123`);
    expect(parsed?.query.token).toBe('abc-123');
  });

  it('webPathToDeepLink is the same validator in the other direction', () => {
    expect(webPathToDeepLink('javascript:alert(1)')).toBeNull();
    expect(webPathToDeepLink('/')).toBeNull(); // bare root has no deep-link meaning
    expect(isSafeWebPath('/search?city=joburg')).toBe(true);
    expect(isSafeWebPath('//evil.com/x')).toBe(false);
  });
});
