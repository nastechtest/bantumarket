import { describe, expect, it, mock } from 'bun:test';
import './dom-globals.js';
import {
  clearSellerSession,
  isSellerSession,
  isSessionLive,
  memoryStore,
  readSellerSession,
  SESSION_STORAGE_KEY,
  subscribeSession,
  writeSellerSession,
  type SellerSession,
} from './session.js';
import { deviceLabel, readDeviceTrust, revokeDeviceTrust, trustThisDevice } from './device-trust.js';
import { signOut } from './signout.js';
import { maskEmail, maskPhone, normalisePhone, parseIdentifier } from './identifier.js';
import { safeReturnTo } from './signin-page.js';
import { magicTokenFromLocation } from './magic-link-return.js';
import { createFixtureAuthTransport } from './api/fixtures.js';
import { win } from './test-dom.js';

const NOW = new Date('2026-10-16T12:00:00+02:00');

function session(overrides: Partial<SellerSession> = {}): SellerSession {
  return {
    sellerId: 'usr_1',
    displayName: 'Pieter',
    email: null,
    phone: '+27821234567',
    tier: 'T1',
    signedInAt: '2026-10-16T10:00:00+02:00',
    expiresAt: '2026-11-15T10:00:00+02:00',
    ...overrides,
  };
}

describe('identifier parsing', () => {
  it('accepts a national mobile and normalises it to E.164', () => {
    const r = parseIdentifier('082 123 4567');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('phone');
      expect(r.value).toBe('+27821234567');
      expect(r.display).toBe('082 123 4567');
    }
  });

  it('accepts +27 and 0027 forms', () => {
    expect(normalisePhone('+27 82 123 4567')).toBe('+27821234567');
    expect(normalisePhone('0027821234567')).toBe('+27821234567');
  });

  it('refuses a landline with the reason, not a generic error', () => {
    const r = parseIdentifier('011 234 5678');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/landline/i);
  });

  it('refuses empty input and malformed email', () => {
    expect(parseIdentifier('').ok).toBe(false);
    const email = parseIdentifier('pieter@');
    expect(email.ok).toBe(false);
    if (!email.ok) expect(email.message).toMatch(/typo/i);
  });

  it('lower-cases a valid email', () => {
    const r = parseIdentifier('Pieter@Example.co.za');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('pieter@example.co.za');
  });

  it('masks a phone and an email without leaking the middle', () => {
    expect(maskPhone('+27821234567')).toBe('082 ••• 67');
    expect(maskPhone('+27821234567')).not.toContain('1234');
    expect(maskEmail('pieter@example.co.za')).toBe('pi••••@example.co.za');
  });
});

describe('seller session storage', () => {
  it('round-trips a valid live session', () => {
    const store = memoryStore();
    writeSellerSession(session(), store);
    const read = readSellerSession(store, NOW);
    expect(read?.sellerId).toBe('usr_1');
    expect(store.getItem(SESSION_STORAGE_KEY)).toContain('usr_1');
  });

  it('treats an expired session as no session', () => {
    const store = memoryStore();
    writeSellerSession(session({ expiresAt: '2026-10-15T00:00:00+02:00' }), store);
    expect(readSellerSession(store, NOW)).toBeNull();
  });

  it('an unparseable expiry is expired, not valid forever', () => {
    expect(isSessionLive(session({ expiresAt: 'soon' }), NOW)).toBe(false);
  });

  it('rejects malformed JSON and an invented tier', () => {
    const store = memoryStore({ [SESSION_STORAGE_KEY]: '{not json' });
    expect(readSellerSession(store, NOW)).toBeNull();
    const badTier = memoryStore({ [SESSION_STORAGE_KEY]: JSON.stringify({ ...session(), tier: 'T9' }) });
    expect(readSellerSession(badTier, NOW)).toBeNull();
  });

  it('isSellerSession rejects arrays and partial objects', () => {
    expect(isSellerSession([])).toBe(false);
    expect(isSellerSession({ sellerId: 'x' })).toBe(false);
    expect(isSellerSession(session())).toBe(true);
  });

  it('clearing removes the session', () => {
    const store = memoryStore();
    writeSellerSession(session(), store);
    clearSellerSession(store);
    expect(store.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('notifies same-tab listeners on write', () => {
    const store = memoryStore();
    const listener = mock(() => {});
    const off = subscribeSession(listener);
    writeSellerSession(session(), store);
    win.dispatchEvent(new win.Event('nastech:seller-session'));
    expect(listener).toHaveBeenCalled();
    off();
  });
});

describe('device trust', () => {
  it('stores a random token with a coarse label and an expiry', () => {
    const store = memoryStore();
    const trust = trustThisDevice({ now: NOW, store, label: 'Chrome on Android' });
    expect(trust.deviceToken.length).toBeGreaterThan(6);
    expect(trust.deviceToken).not.toContain('Pieter');
    expect(readDeviceTrust(store, NOW)?.label).toBe('Chrome on Android');
  });

  it('expires and revokes', () => {
    const store = memoryStore();
    trustThisDevice({ now: NOW, store, days: 1 });
    expect(readDeviceTrust(store, new Date('2026-10-18T00:00:00+02:00'))).toBeNull();
    revokeDeviceTrust(store);
    expect(store.getItem('nastech.seller.device.v1')).toBeNull();
  });

  it('labels the platform coarsely, never a fingerprint', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe('Chrome on Android');
    expect(deviceLabel('Mozilla/5.0 (iPhone) Safari/605')).toBe('Safari on iPhone');
  });
});

describe('sign out', () => {
  it('clears this device even when the server cannot be reached, and says so', async () => {
    const store = memoryStore();
    writeSellerSession(session(), store);
    const navigated: string[] = [];
    const result = await signOut(session(), {
      store,
      navigateTo: (p) => navigated.push(p),
      transport: {
        signOut: async () => {
          throw new Error('offline');
        },
      },
    });
    expect(readSellerSession(store, NOW)).toBeNull();
    expect(result.clearedLocally).toBe(true);
    expect(result.serverNotified).toBe(false);
    expect(result.warning).toMatch(/signed out on this device/i);
    expect(navigated).toEqual(['/sign-in']);
  });

  it('reports full success when the server acknowledges', async () => {
    const store = memoryStore();
    writeSellerSession(session(), store);
    const result = await signOut(session(), { store, transport: { signOut: async () => {} } });
    expect(result.serverNotified).toBe(true);
    expect(result.warning).toBeNull();
  });
});

describe('return paths and magic tokens', () => {
  it('only accepts an in-app path as returnTo', () => {
    expect(safeReturnTo('/payouts')).toBe('/payouts');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo('/sign-in?x=1')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
  });

  it('reads a token from query or hash but not from anywhere else', () => {
    expect(magicTokenFromLocation('http://localhost/sign-in?token=abc')).toBe('abc');
    expect(magicTokenFromLocation('http://localhost/sign-in#ml=abc%201')).toBe('abc 1');
    expect(magicTokenFromLocation('http://localhost/sign-in')).toBeNull();
    expect(magicTokenFromLocation('::not a url')).toBeNull();
  });

  it('the fixture verifies its one token and refuses everything else', async () => {
    const api = createFixtureAuthTransport();
    await expect(api.verifyLink('nope')).rejects.toThrow(/expired/i);
    await expect(api.verifyLink('ml_demo_nomsa')).resolves.toMatchObject({ sellerId: 'usr_seller_pieter' });
  });
});
