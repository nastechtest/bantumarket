import { describe, expect, it } from 'bun:test';
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import './dom-setup.js';
import { win } from './dom-setup.js';
import { countOf, documentTitleFor, firstNameOf, initialsOf } from '../lib/format.js';
import { internalPath, returnToFromSearch, signInHref } from '../lib/navigate.js';
import {
  browserKeyValues,
  memoryKeyValues,
  readJson,
  writeJson,
} from '../lib/storage.js';
import {
  clearPendingAction,
  consumePendingAction,
  PENDING_ACTION_KEY,
  PENDING_ACTION_TTL_MS,
  pendingActionFor,
  readPendingAction,
  savePendingAction,
} from '../lib/pending-action.js';
import {
  createOnlineStore,
  offlineNotice,
  OFFLINE_HEADLINE,
  useOnlineStatus,
  type OnlineSource,
} from '../lib/online.js';
import {
  formatZaPhone,
  parseZaPhone,
  supportContact,
  supportHref,
} from '../lib/support.js';
import {
  bootSeller,
  createSellerRuntime,
  envString,
  installMotionCss,
  MOTION_STYLE_ID,
  readPublicEnv,
  SellerProviders,
  useSellerRuntime,
} from '../bootstrap.js';
import { createSellerSessionStore } from '../lib/session.js';
import { mount, textOf } from './mount.js';

describe('format helpers', () => {
  it('derives initials from real names and refuses to invent one', () => {
    expect(initialsOf('Thandi Mokoena')).toBe('TM');
    expect(initialsOf('  Thandi   Mokoena  ')).toBe('TM');
    expect(initialsOf('Thandi')).toBe('T');
    expect(initialsOf('')).toBe('•');
  });

  it('first name, or null rather than a fabricated greeting', () => {
    expect(firstNameOf('Thandi Mokoena')).toBe('Thandi');
    expect(firstNameOf('  ')).toBeNull();
    expect(firstNameOf('')).toBeNull();
  });

  it('counts lead and pluralise', () => {
    expect(countOf(0, 'listing')).toBe('0 listings');
    expect(countOf(1, 'listing')).toBe('1 listing');
    expect(countOf(2, 'listing')).toBe('2 listings');
    expect(countOf(2, 'sale', 'sales')).toBe('2 sales');
  });

  it('names the document for the route and still names the app when the label is empty', () => {
    expect(documentTitleFor('Payouts')).toBe('Payouts — NasTech Market Seller');
    expect(documentTitleFor('  ')).toBe('NasTech Market — Seller');
  });
});

describe('navigation strings', () => {
  it('accepts only in-app paths', () => {
    expect(internalPath('/payouts?tab=history#bank')).toBe('/payouts?tab=history#bank');
    expect(internalPath(null)).toBe('/');
    expect(internalPath('')).toBe('/');
    expect(internalPath('payouts')).toBe('/');
    expect(internalPath('https://evil.example/payouts')).toBe('/');
    expect(internalPath('//evil.example/payouts')).toBe('/');
    expect(internalPath('/\\evil.example')).toBe('/');
    expect(internalPath('/payouts\u0000')).toBe('/');
    expect(internalPath(null, '/listings')).toBe('/listings');
  });

  it('builds the sign-in redirect with an encoded returnTo and no loop', () => {
    expect(signInHref('/payouts?tab=history')).toBe('/sign-in?returnTo=%2Fpayouts%3Ftab%3Dhistory');
    expect(signInHref('/sign-in')).toBe('/sign-in');
    expect(signInHref('/sign-in?returnTo=%2Fpayouts')).toBe('/sign-in');
    expect(signInHref('//evil.example')).toBe('/sign-in?returnTo=%2F');
  });

  it('reads a useful returnTo from search and rejects the rest', () => {
    expect(returnToFromSearch('?returnTo=%2Fpayouts%3Ftab%3Dhistory')).toBe('/payouts?tab=history');
    expect(returnToFromSearch('returnTo=%2Flistings')).toBe('/listings');
    expect(returnToFromSearch('?returnTo=%2F')).toBeNull();
    expect(returnToFromSearch('?returnTo=%2Fsign-in')).toBeNull();
    expect(returnToFromSearch('?returnTo=%2F%2Fevil.example')).toBeNull();
    expect(returnToFromSearch('')).toBeNull();
  });
});

describe('storage is total', () => {
  it('memory store seeds, writes and removes', () => {
    const store = memoryKeyValues({ a: '1' });
    expect(store.get('a')).toBe('1');
    store.set('b', '2');
    expect(store.get('b')).toBe('2');
    store.remove('a');
    expect(store.get('a')).toBeNull();
  });

  it('browser storage falls back to memory when the browser refuses or throws', () => {
    const noRoot = browserKeyValues('local', undefined);
    noRoot.set('k', 'v');
    expect(noRoot.get('k')).toBe('v');

    const hostile = {
      localStorage: {
        setItem() {
          throw new Error('SecurityError');
        },
        getItem: () => null,
        removeItem() {},
      },
    } as unknown as Window;
    const fallback = browserKeyValues('local', hostile);
    fallback.set('k', 'v');
    expect(fallback.get('k')).toBe('v');
  });

  it('JSON reads reject corrupt data and writes report failure instead of throwing', () => {
    const store = memoryKeyValues();
    expect(readJson(store, 'missing', (value) => value)).toBeNull();
    store.set('bad', '{not json');
    expect(readJson(store, 'bad', (value) => value)).toBeNull();

    expect(writeJson(store, 'ok', { a: 1 })).toBe(true);
    expect(readJson(store, 'ok', (value) => value)).toEqual({ a: 1 });

    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(writeJson(store, 'circular', circular)).toBe(false);

    const throwing = {
      get: () => null,
      set() {
        throw new Error('QuotaExceededError');
      },
      remove() {},
    };
    expect(writeJson(throwing, 'k', { a: 1 })).toBe(false);
  });
});

describe('pending action for returnTo', () => {
  it('accepts a real destination and rejects sign-in, home and off-origin paths', () => {
    expect(pendingActionFor('/payouts?tab=history', 100)).toEqual({
      path: '/payouts?tab=history',
      savedAt: 100,
      reason: 'session-required',
    });
    expect(pendingActionFor('/', 100)).toBeNull();
    expect(pendingActionFor('/sign-in', 100)).toBeNull();
    expect(pendingActionFor('/sign-in?returnTo=%2Fpayouts', 100)).toBeNull();
    expect(pendingActionFor('//evil.example', 100)).toBeNull();
  });

  it('round-trips, expires, rejects corruption and is consumed once', () => {
    const store = memoryKeyValues();
    const now = 1_700_000_000_000;
    expect(savePendingAction(pendingActionFor('/payouts', now)!, store)).toBe(true);
    expect(readPendingAction(store, now + 1000)?.path).toBe('/payouts');

    expect(readPendingAction(store, now + PENDING_ACTION_TTL_MS + 1)).toBeNull();
    expect(readPendingAction(store, now - 1)).toBeNull();

    expect(consumePendingAction(store, now)?.path).toBe('/payouts');
    expect(readPendingAction(store, now)).toBeNull();

    store.set(PENDING_ACTION_KEY, JSON.stringify({ path: '/payouts', savedAt: now, reason: 'other' }));
    expect(readPendingAction(store, now)).toBeNull();
    store.set(PENDING_ACTION_KEY, '{broken');
    expect(readPendingAction(store, now)).toBeNull();

    savePendingAction(pendingActionFor('/settings', now)!, store);
    clearPendingAction(store);
    expect(store.get(PENDING_ACTION_KEY)).toBeNull();
  });
});

function fakeSource(initial: boolean): OnlineSource & { emit(value: boolean): void } {
  let handler: ((value: boolean) => void) | null = null;
  return {
    initial: () => initial,
    subscribe(next) {
      handler = next;
      return () => {
        handler = null;
      };
    },
    emit(value) {
      handler?.(value);
    },
  };
}

describe('online store and copy', () => {
  it('notifies once per real change and stops after dispose', () => {
    const source = fakeSource(true);
    const store = createOnlineStore(source);
    let notifications = 0;
    store.subscribe(() => notifications++);

    source.emit(true);
    expect(notifications).toBe(0);
    source.emit(false);
    expect(store.get()).toBe(false);
    expect(notifications).toBe(1);

    store.set(false);
    expect(notifications).toBe(1);
    store.set(true);
    expect(notifications).toBe(2);

    store.dispose();
    source.emit(false);
    expect(store.get()).toBe(true);
  });

  it('says the headline and makes no delivery promise', () => {
    expect(offlineNotice(true)).toBeNull();
    const notice = offlineNotice(false);
    expect(notice).toContain(OFFLINE_HEADLINE);
    expect(notice).toContain('Nothing is being sent');
    expect(notice).toContain('do not change bank or payout details');
  });

  it('the hook follows the store', async () => {
    const store = createOnlineStore(fakeSource(true));
    function Probe() {
      const online = useOnlineStatus(store);
      return <span data-online={online ? 'yes' : 'no'}>{online ? 'online' : 'offline'}</span>;
    }
    const mounted = mount(<Probe />);
    expect(textOf(mounted.container)).toBe('online');
    await act(() => {
      store.set(false);
    });
    expect(textOf(mounted.container)).toBe('offline');
    mounted.unmount();
    store.dispose();
  });
});

describe('support contact', () => {
  it('formats and validates ZA numbers', () => {
    expect(parseZaPhone('+27 82 000 5555')).toBe('+27820005555');
    expect(parseZaPhone('+1 555 0100')).toBeNull();
    expect(parseZaPhone(null)).toBeNull();
    expect(formatZaPhone('+27820005555')).toBe('+27 82 000 5555');
  });

  it('prefers a configured phone, falls back to the default email, and refuses a bad email', () => {
    expect(supportContact({ VITE_SUPPORT_PHONE: '+27 82 000 5555' })).toEqual({
      kind: 'phone',
      display: '+27 82 000 5555',
    });
    expect(supportContact({ VITE_SUPPORT_PHONE: '   ', VITE_SUPPORT_EMAIL: 'help@example.co.za' })).toEqual({
      kind: 'email',
      display: 'help@example.co.za',
    });
    expect(supportContact({})).toEqual({ kind: 'email', display: 'support@nastech.market' });
    expect(supportContact({ VITE_SUPPORT_EMAIL: 'not-an-email' })).toBeNull();
    expect(supportHref({ kind: 'email', display: 'help@example.co.za' })).toBe(
      'mailto:help@example.co.za',
    );
    expect(supportHref({ kind: 'phone', display: '+27 82 000 5555' })).toBe('tel:+27820005555');
  });
});

describe('bootstrap', () => {
  it('reads env through one guarded door', () => {
    expect(readPublicEnv({ env: { VITE_X: 'y' } } as unknown as ImportMeta)).toEqual({ VITE_X: 'y' });
    expect(readPublicEnv({} as ImportMeta)).toEqual({});
    expect(envString({ A: '  value  ' }, 'A')).toBe('value');
    expect(envString({ A: '   ' }, 'A')).toBeNull();
    expect(envString({ A: true }, 'A')).toBeNull();
  });

  it('installs the generated motion CSS once and removes it', () => {
    const doc = win.document;
    const remove = installMotionCss(doc);
    const styles = doc.querySelectorAll(`#${MOTION_STYLE_ID}`);
    expect(styles.length).toBe(1);
    expect(styles[0]?.textContent).toContain('--motion-standard');
    expect(styles[0]?.textContent).toContain('prefers-reduced-motion');

    const second = installMotionCss(doc);
    expect(doc.querySelectorAll(`#${MOTION_STYLE_ID}`).length).toBe(1);
    second();

    remove();
    expect(doc.getElementById(MOTION_STYLE_ID)).toBeNull();
    installMotionCss(undefined)();
  });

  it('builds a runtime without inventing a session, and boots/cleans up motion CSS', () => {
    const session = createSellerSessionStore({ status: 'anonymous' });
    const runtime = createSellerRuntime({
      session,
      env: { VITE_SUPPORT_EMAIL: 'seller-help@example.co.za' },
      onlineSource: fakeSource(false),
    });
    expect(runtime.session).toBe(session);
    expect(runtime.support).toEqual({ kind: 'email', display: 'seller-help@example.co.za' });
    expect(runtime.onlineStore.get()).toBe(false);
    runtime.dispose();

    const booted = bootSeller({
      session,
      env: {},
      onlineSource: fakeSource(true),
      document: win.document,
    });
    expect(win.document.getElementById(MOTION_STYLE_ID)).not.toBeNull();
    booted.dispose();
    expect(win.document.getElementById(MOTION_STYLE_ID)).toBeNull();
  });

  it('provides the runtime to features and refuses to be read outside the provider', () => {
    const session = createSellerSessionStore({ status: 'anonymous' });
    const runtime = createSellerRuntime({ session, env: {}, onlineSource: fakeSource(true) });

    function Probe() {
      const value = useSellerRuntime();
      return <span data-same={value.session === session ? 'yes' : 'no'}>{value.support?.kind}</span>;
    }

    const html = renderToStaticMarkup(
      <SellerProviders runtime={runtime}>
        <Probe />
      </SellerProviders>,
    );
    expect(html).toContain('data-same="yes"');
    expect(html).toContain('email');

    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(/SellerProviders/);
    runtime.dispose();
  });
});
