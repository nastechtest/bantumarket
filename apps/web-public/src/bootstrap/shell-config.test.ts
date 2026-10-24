import { describe, it, expect } from 'bun:test';
import { defaultFlags, FLAG_DEFAULTS, resolveFlags } from './feature-flags.js';
import { formatZaPhone, parseZaPhone, supportContact, supportHref, DEFAULT_SUPPORT_EMAIL } from './support-number.js';
import { envString, readPublicEnv } from './env.js';

describe('feature flags', () => {
  it('offline payment queueing is OFF at the default and stays off under garbage input', () => {
    expect(FLAG_DEFAULTS['pay.offlineQueue']).toBe(false);
    expect(resolveFlags('{"pay.offlineQueue": 1}')['pay.offlineQueue']).toBe(false); // not a boolean
    expect(resolveFlags('not json at all')['pay.offlineQueue']).toBe(false);
    expect(resolveFlags('[true, false]')['pay.offlineQueue']).toBe(false);
  });

  it('booleans in the source override defaults; unknown keys are ignored', () => {
    const flags = resolveFlags('{"chrome.tabBar": false, "feature.totallyUnknown": true}');
    expect(flags['chrome.tabBar']).toBe(false);
    expect(flags).not.toHaveProperty('feature.totallyUnknown');
  });

  it('caller overrides beat the env source (debug panel beats build, within the same table)', () => {
    const flags = resolveFlags('{"scene.autoOpen": true}', { 'scene.autoOpen': false });
    expect(flags['scene.autoOpen']).toBe(false);
  });

  it('defaultFlags is a copy, not the mutable table leaking out', () => {
    expect(defaultFlags).toEqual(FLAG_DEFAULTS);
    expect(defaultFlags).not.toBe(FLAG_DEFAULTS as object);
  });
});

describe('support contact', () => {
  it('a configured E.164 +27 number wins and formats displayably', () => {
    const contact = supportContact({ VITE_SUPPORT_PHONE: '+27 800 400 123' });
    expect(contact?.kind).toBe('phone');
    expect(contact?.display).toBe(formatZaPhone('+27800400123'));
    expect(supportHref(contact!)).toBe('tel:+27800400123');
  });

  it('a foreign or short number is rejected; email is the honest fallback', () => {
    expect(parseZaPhone('+1 555 0100')).toBeNull();
    expect(parseZaPhone('+27 12')).toBeNull();
    const contact = supportContact({ VITE_SUPPORT_PHONE: '+1 555 0100' });
    expect(contact?.kind).toBe('email');
    expect(supportHref(contact!)).toBe(`mailto:${DEFAULT_SUPPORT_EMAIL}`);
  });

  it('a malformed email yields NO contact — the footer renders nothing rather than a fake', () => {
    expect(supportContact({ VITE_SUPPORT_EMAIL: 'not-an-email' })).toBeNull();
  });
});

describe('env access is total', () => {
  it('missing import.meta.env reads as an empty env, not a crash', () => {
    const meta = {} as ImportMeta;
    expect(readPublicEnv(meta)).toEqual({});
  });

  it('empty-string configuration counts as unset', () => {
    expect(envString({ VITE_SUPPORT_PHONE: '   ' }, 'VITE_SUPPORT_PHONE')).toBeNull();
    expect(envString({ VITE_SUPPORT_PHONE: '+27800400123' }, 'VITE_SUPPORT_PHONE')).toBe('+27800400123');
  });
});
