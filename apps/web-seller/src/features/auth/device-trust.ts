import type { KeyValueStore } from './session.js';

/**
 * Device trust: a random token kept on this phone so a returning seller can skip the SMS. It is
 * not a fingerprint — no canvas hash, no IP, no advertising id — because the only thing it needs
 * to prove is "this browser still holds the secret we issued". Revocable from Settings, and the
 * copy never calls it verification: holding a token proves possession, not identity.
 */

export const DEVICE_STORAGE_KEY = 'nastech.seller.device.v1';

export interface DeviceTrust {
  readonly deviceToken: string;
  readonly label: string;
  readonly trustedUntil: string;
}

function store(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function randomToken(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID !== undefined) return c.randomUUID();
  return `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** A coarse label the seller will recognise; never a device fingerprint. */
export function deviceLabel(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'this browser';
  const platform = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iPhone' : /Linux/.test(userAgent) ? 'Linux' : /Mac/.test(userAgent) ? 'Mac' : /Windows/.test(userAgent) ? 'Windows' : 'device';
  return `${browser} on ${platform}`;
}

export function trustThisDevice(opts: { now?: Date; days?: number; store?: KeyValueStore | null; label?: string } = {}): DeviceTrust {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 30;
  const target = opts.store === undefined ? store() : opts.store;
  const trust: DeviceTrust = {
    deviceToken: randomToken(),
    label: opts.label ?? deviceLabel(),
    trustedUntil: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
  };
  target?.setItem(DEVICE_STORAGE_KEY, JSON.stringify(trust));
  return trust;
}

export function readDeviceTrust(target: KeyValueStore | null = store(), now: Date = new Date()): DeviceTrust | null {
  if (target === null) return null;
  const raw = target.getItem(DEVICE_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DeviceTrust>;
    if (typeof parsed.deviceToken !== 'string' || typeof parsed.trustedUntil !== 'string' || typeof parsed.label !== 'string') return null;
    if (!(Date.parse(parsed.trustedUntil) > now.getTime())) return null;
    return { deviceToken: parsed.deviceToken, label: parsed.label, trustedUntil: parsed.trustedUntil };
  } catch {
    return null;
  }
}

export function revokeDeviceTrust(target: KeyValueStore | null = store()): void {
  target?.removeItem(DEVICE_STORAGE_KEY);
}
