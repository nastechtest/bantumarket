import { describe, expect, it } from 'bun:test';
import { act, createElement } from 'react';
import type { ReactElement } from 'react';
import './test-dom.js';
import { createSessionStore, memoryKeyValues, webKeyValues } from './session-storage.js';
import { useSession, type UseSessionResult } from './use-session.js';
import { RequireSession } from './routes-guard.js';
import { AuthError, type AuthApi, type SessionInfo } from './api/auth-transport.js';
import { createFakeAuthApi } from './api/fixtures.js';
import { mount, text } from './test-dom.js';

/**
 * The session posture, tested: the client flag is a cache of the server's answer, never a
 * substitute for it. A stale localStorage hint, an ended-elsewhere session, an offline check —
 * each must render the truth, and no secret may ever sit where a page refresh (or a phone
 * inspection by a stranger) can read it.
 *
 * (Written with createElement so the file keeps the exact `.ts` name the brief lists.)
 */

const E164 = '+27820000555';

type Store = ReturnType<typeof createSessionStore>;

function probeSession(api: AuthApi, store: Store, sink: (r: UseSessionResult) => void): ReactElement {
  function Probe(): ReactElement {
    const r = useSession(api, store);
    sink(r);
    return createElement('div', { 'data-testid': 'probe' }, r.status);
  }
  return createElement(Probe);
}

describe('session-storage', () => {
  it('persists only the opaque id, a masked number, and a timestamp — nothing secret', () => {
    const backing = memoryKeyValues();
    const store = createSessionStore(backing);
    store.writeHint({ sessionId: 'sess_9', e164: E164 }, 1_730_000_000_000);
    const hint = store.readHint();
    expect(hint?.sessionId).toBe('sess_9');
    expect(hint?.e164Masked).toBe('+27 82 ••• 55');
    const persisted = backing.get('nastech.sessionhint.v1') ?? '';
    expect(persisted).not.toContain(E164);
    expect(persisted).toMatch(/"sessionId":"sess_9"/);
  });

  it('bearer fallback tokens never reach the persisted store, ever', () => {
    const backing = memoryKeyValues();
    const store = createSessionStore(backing);
    store.setAccessToken('super-secret-bearer-token');
    store.writeHint({ sessionId: 'sess_9', e164: E164 }, 1);
    const persisted = backing.get('nastech.sessionhint.v1') ?? '';
    expect(persisted).not.toContain('super-secret-bearer-token');
    // A second store (fresh page load) sees the hint but NOT the token — memory died with the page.
    const reopened = createSessionStore(backing);
    expect(reopened.accessToken()).toBeNull();
    expect(reopened.readHint()?.sessionId).toBe('sess_9');
    store.clear();
    expect(store.accessToken()).toBeNull();
    expect(reopened.readHint()).toBeNull();
  });

  it('webKeyValues falls back to memory when localStorage throws (privacy mode)', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        setItem() {
          throw new Error('SecurityError');
        },
        getItem: () => null,
        removeItem() {},
      },
    });
    try {
      const store = webKeyValues();
      expect(() => store.set('k', 'v')).not.toThrow();
      // The fallback keeps the value for this page life. It is a display hint the server is asked to
      // confirm before anything is believed (see use-session.ts), so an in-memory copy is neither a
      // secret at rest nor a claim of being signed in.
      expect(store.get('k')).toBe('v');
      // And it is per-call, not a module global: a second store cannot read the first's hint. In
      // SSR that distinction is the difference between one buyer's hint and the next buyer's, and
      // in the browser it is the honest cost of private mode — a reload starts from nothing.
      expect(webKeyValues().get('k')).toBeNull();
      store.remove('k');
      expect(store.get('k')).toBeNull();
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: original });
    }
  });

  it('a corrupt hint is ignored, not trusted', () => {
    const backing = memoryKeyValues();
    backing.set('nastech.sessionhint.v1', '{not json');
    const store = createSessionStore(backing);
    expect(store.readHint()).toBeNull();
  });
});

describe('use-session', () => {
  it('starts checking and becomes anonymous when the server says no — never trusts a stale hint', async () => {
    const h = createFakeAuthApi();
    const store = createSessionStore(memoryKeyValues());
    store.writeHint({ sessionId: 'sess_STALE', e164: E164 }, 1);
    const seen: UseSessionResult[] = [];
    const m = mount(probeSession(h.api, store, (r) => seen.push(r)));
    expect(seen[0]!.status).toBe('checking'); // hint exists, still 'checking' — that is the whole rule
    await m.flush();
    expect(seen[seen.length - 1]!.status).toBe('anonymous');
    m.unmount();
  });

  it('becomes authenticated only after the server confirms the session', async () => {
    const h = createFakeAuthApi();
    h.seedUser(E164, {});
    const t = await h.api.requestOtp({ e164: E164 });
    await h.api.verifyOtp({ otpId: t.otpId, code: h.outbox[0]!.code });
    const store = createSessionStore(memoryKeyValues());
    const seen: UseSessionResult[] = [];
    const m = mount(probeSession(h.api, store, (r) => seen.push(r)));
    await m.flush();
    const last = seen[seen.length - 1]!;
    expect(last.status).toBe('authenticated');
    expect(last.session?.e164).toBe(E164);
    expect(store.readHint()?.e164Masked).toBe('+27 82 ••• 55');
    m.unmount();
  });

  it('a session ended elsewhere is noticed on refresh — no client-side flag survives it', async () => {
    const h = createFakeAuthApi();
    const t = await h.api.requestOtp({ e164: E164 });
    await h.api.verifyOtp({ otpId: t.otpId, code: h.outbox[0]!.code });
    const store = createSessionStore(memoryKeyValues());
    let latest!: UseSessionResult;
    const m = mount(probeSession(h.api, store, (r) => {
      latest = r;
    }));
    await m.flush();
    expect(latest.status).toBe('authenticated');
    await h.api.endSession(); // signed out from another surface
    await act(async () => {
      latest.refresh();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(latest.status).toBe('anonymous');
    expect(latest.session).toBeNull();
    m.unmount();
  });

  it('transport failure reads as error, not as anonymous — offline is not signed out', async () => {
    const base = createFakeAuthApi().api;
    const api: AuthApi = {
      ...base,
      async getSession() {
        throw AuthError.of('network');
      },
    };
    const store = createSessionStore(memoryKeyValues());
    let latest!: UseSessionResult;
    const m = mount(probeSession(api, store, (r) => {
      latest = r;
    }));
    await m.flush();
    expect(latest.status).toBe('error');
    expect(latest.errorCode).toBe('network');
    m.unmount();
  });

  it('signOut ends the server session and wipes the client', async () => {
    const h = createFakeAuthApi();
    const t = await h.api.requestOtp({ e164: E164 });
    await h.api.verifyOtp({ otpId: t.otpId, code: h.outbox[0]!.code });
    const store = createSessionStore(memoryKeyValues());
    let latest!: UseSessionResult;
    const m = mount(probeSession(h.api, store, (r) => {
      latest = r;
    }));
    await m.flush();
    await act(async () => {
      await latest.signOut();
    });
    expect(latest.status).toBe('anonymous');
    expect(store.readHint()).toBeNull();
    expect(await h.api.getSession()).toBeNull();
    m.unmount();
  });
});

describe('RequireSession', () => {
  it('shows the gate, not the protected content, while anonymous', async () => {
    const h = createFakeAuthApi();
    const m = mount(
      createElement(RequireSession, { api: h.api, children: createElement('p', null, 'SECRET ORDER PAGE') }),
    );
    await m.flush();
    expect(m.container.querySelector('[data-testid="guard-signin"]')).not.toBeNull();
    expect(text(m.container)).not.toContain('SECRET ORDER PAGE');
    m.unmount();
  });

  it('renders the child once the server confirms the session', async () => {
    const h = createFakeAuthApi();
    const t = await h.api.requestOtp({ e164: E164 });
    await h.api.verifyOtp({ otpId: t.otpId, code: h.outbox[0]!.code });
    const m = mount(createElement(RequireSession, { api: h.api, children: createElement('p', null, 'ORDER PAGE') }));
    await m.flush();
    expect(text(m.container)).toContain('ORDER PAGE');
    m.unmount();
  });

  it('while checking, shows neither content nor a sign-in form', async () => {
    let releaseSession: (s: SessionInfo | null) => void = () => {};
    const base = createFakeAuthApi().api;
    const slow: AuthApi = {
      ...base,
      getSession: () =>
        new Promise<SessionInfo | null>((r) => {
          releaseSession = r;
        }),
    };
    const m = mount(createElement(RequireSession, { api: slow, children: createElement('p', null, 'ORDER PAGE') }));
    expect(text(m.container)).toMatch(/Checking your session/i);
    expect(text(m.container)).not.toContain('ORDER PAGE');
    await act(async () => {
      releaseSession(null);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(m.container.querySelector('[data-testid="guard-signin"]')).not.toBeNull();
    m.unmount();
  });
});
