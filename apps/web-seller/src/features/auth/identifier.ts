/**
 * Seller sign-in identifiers: a South African mobile number or an email address.
 *
 * Deliberately local and strict: a typo caught here costs the seller three seconds; a typo caught
 * by the SMS provider costs a code that never arrives and a seller who concludes the platform is
 * broken. No international format is promised for launch (South Africa only, one city).
 */

export type IdentifierKind = 'phone' | 'email';

export interface ParsedIdentifier {
  readonly ok: true;
  readonly kind: IdentifierKind;
  /** E.164 for phones, lower-cased trimmed email otherwise. */
  readonly value: string;
  /** What the confirmation screen says back to the seller. */
  readonly display: string;
}

export interface IdentifierError {
  readonly ok: false;
  readonly message: string;
}

export type IdentifierResult = ParsedIdentifier | IdentifierError;

const SA_MOBILE = /^(\+27|0)(6|7|8)\d{8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[\s()\-.]/g, '');
  if (digits.startsWith('+27')) return digits;
  if (digits.startsWith('0027')) return `+${digits.slice(2)}`;
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0')) return `+27${digits.slice(1)}`;
  return digits;
}

export function parseIdentifier(raw: string): IdentifierResult {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: 'Enter your mobile number or email address.' };
  if (value.includes('@')) {
    if (!EMAIL.test(value)) return { ok: false, message: 'That email address is missing something. Check for a typo.' };
    return { ok: true, kind: 'email', value: value.toLowerCase(), display: value.toLowerCase() };
  }
  const phone = normalisePhone(value);
  if (!SA_MOBILE.test(phone)) {
    return {
      ok: false,
      message: 'Enter a South African mobile number, for example 082 123 4567. We cannot send a sign-in code to a landline.',
    };
  }
  const national = `0${phone.slice(3)}`;
  return {
    ok: true,
    kind: 'phone',
    value: phone,
    display: `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`,
  };
}

/** `+27 82 ••• 67` — enough to recognise your own number, not enough to leak it in a screenshot. */
export function maskPhone(e164: string): string {
  const national = e164.startsWith('+27') ? `0${e164.slice(3)}` : e164;
  if (national.length < 7) return '•••';
  return `${national.slice(0, 3)} ••• ${national.slice(-2)}`;
}

export function maskEmail(address: string): string {
  const [local, domain] = address.split('@');
  if (local === undefined || domain === undefined || local.length === 0) return '•••';
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${'•'.repeat(Math.max(1, local.length - shown.length))}@${domain}`;
}
