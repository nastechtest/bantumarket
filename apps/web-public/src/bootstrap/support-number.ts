import { envString, publicEnv } from './env.js';

/**
 * Support contact. There is no invented phone number in this file — a marketplace footer with a
 * number nobody staffs is worse than no number, and "support hours" you can't honour is the kind
 * of claim §13.2 is about. The app configures exactly one of: a real ZA toll-free/mobile number
 * (`VITE_SUPPORT_PHONE`, E.164 `+27` only) or an email (`VITE_SUPPORT_EMAIL`); whichever exists
 * wins, phone first (a buyer mid-dispute dials before they write).
 *
 * Until ops sets `VITE_SUPPORT_PHONE`, `supportContact` returns an email-only contact and every
 * surface renders `supportHref` as a mailto — see layout/footer.tsx, which refuses to print a
 * contact that doesn't exist.
 */

export const DEFAULT_SUPPORT_EMAIL = 'support@nastech.market';

const ZA_PHONE = /^\+27\d{9}$/; // E.164 ZA: 9 digits after +27 (fixed lines and mobiles both fit)

export interface SupportContact {
  readonly kind: 'phone' | 'email';
  /** Already formatted for display, with spaces. */
  readonly display: string;
}

export function formatZaPhone(e164: string): string {
  const digits = e164.slice('+27'.length); // ZA national numbers display 2 3 4 after the country code
  return `+27 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

export function parseZaPhone(raw: string | null): string | null {
  if (raw === null) return null;
  const compact = raw.replace(/[\s()-]/g, '');
  return ZA_PHONE.test(compact) ? compact : null;
}

export function supportContact(env: Record<string, string | boolean | undefined> = publicEnv): SupportContact | null {
  const phone = parseZaPhone(envString(env, 'VITE_SUPPORT_PHONE'));
  if (phone !== null) return { kind: 'phone', display: formatZaPhone(phone) };
  const email = envString(env, 'VITE_SUPPORT_EMAIL') ?? DEFAULT_SUPPORT_EMAIL;
  if (/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) return { kind: 'email', display: email };
  return null;
}

export function supportHref(contact: SupportContact): string {
  return contact.kind === 'phone' ? `tel:${contact.display.replace(/\s/g, '')}` : `mailto:${contact.display}`;
}
