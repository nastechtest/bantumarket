/**
 * Support contact. There is no invented phone number here: a seller footer with a number
 * nobody answers is a claim the business cannot honour. The app configures a real ZA number
 * (`VITE_SUPPORT_PHONE`, E.164) or an email (`VITE_SUPPORT_EMAIL`); phone wins when both exist
 * because a seller mid-dispute dials before they write.
 */

export const DEFAULT_SUPPORT_EMAIL = 'support@nastech.market';

const ZA_PHONE = /^\+27\d{9}$/;

export interface SupportContact {
  readonly kind: 'phone' | 'email';
  readonly display: string;
}

export function formatZaPhone(e164: string): string {
  const digits = e164.slice('+27'.length);
  return `+27 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

export function parseZaPhone(raw: string | null): string | null {
  if (raw === null) return null;
  const compact = raw.replace(/[\s()-]/g, '');
  return ZA_PHONE.test(compact) ? compact : null;
}

export function supportContact(
  env: Record<string, string | boolean | undefined>,
): SupportContact | null {
  const phoneRaw = env['VITE_SUPPORT_PHONE'];
  const phone = parseZaPhone(typeof phoneRaw === 'string' && phoneRaw.trim() !== '' ? phoneRaw.trim() : null);
  if (phone !== null) return { kind: 'phone', display: formatZaPhone(phone) };

  const emailRaw = env['VITE_SUPPORT_EMAIL'];
  const email =
    typeof emailRaw === 'string' && emailRaw.trim() !== '' ? emailRaw.trim() : DEFAULT_SUPPORT_EMAIL;
  if (/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) return { kind: 'email', display: email };
  return null;
}

export function supportHref(contact: SupportContact): string {
  return contact.kind === 'phone'
    ? `tel:${contact.display.replace(/\s/g, '')}`
    : `mailto:${contact.display}`;
}
