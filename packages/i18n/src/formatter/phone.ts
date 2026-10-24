/**
 * South African phone normalisation to E.164.
 *
 * The launch is SA-only, so "a valid number" means "a number in the South African numbering plan",
 * not "ten digits somewhere". Accepted input shapes, exactly as the brief lists them: international
 * `+27…`, national `08…` / `0…` with the trunk zero, and the same with spaces. All normalise to
 * E.164: `+27` + the 9-digit national significant number.
 *
 * The trap this is written to catch is a foreign number that happens to be ten digits — a London
 * landline `2071838301`, say. A length-only parser prepends `+27` and calls it valid. A national
 * number here must begin with the trunk `0` (or be explicitly `+27`), and the digit after the trunk
 * must be a real SA area/mobile prefix (1-8; 0 and 9 are unallocated), so `2071838301` and `+44…`
 * both fail. Rejecting with a reason, rather than coercing, is the point: a checkout that silently
 * "fixes" a UK number into a ZA one loses the customer's actual contact detail.
 */

const SA_COUNTRY_CODE = '27';

export type PhoneError =
  | 'empty'
  | 'too-long'
  | 'too-short'
  | 'not-sa-country-code'
  | 'missing-trunk-zero'
  | 'invalid-sa-prefix';

export type PhoneResult =
  | { readonly valid: true; readonly e164: string; readonly national: string }
  | { readonly valid: false; readonly error: PhoneError };

/**
 * Strip separators. Keep a leading `+`; drop spaces, hyphens, parentheses and dots anywhere. A string
 * that still contains a non-digit (after the leading +) is invalid — this rejects things like
 * "082-abc-defg" rather than quietly dropping the letters.
 */
function canonicalise(raw: string): { plus: boolean; digits: string } | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const plus = trimmed.startsWith('+');
  const body = plus ? trimmed.slice(1) : trimmed;
  let digits = '';
  for (const ch of body) {
    if (ch >= '0' && ch <= '9') digits += ch;
    else if (ch === ' ' || ch === '-' || ch === '(' || ch === ')' || ch === '.') continue;
    else return null; // a stray letter/char
  }
  return { plus, digits };
}

/**
 * The first digit of the national significant number selects the SA block: 1-5 geographic (01x-05x),
 * 6-8 mobile/frequency (06x-08x). 0 and 9 are not allocated to a subscriber range, so a number whose
 * national part starts with them is not a valid ZA subscriber number.
 */
function isValidSaNationalPrefix(firstDigit: string): boolean {
  return firstDigit >= '1' && firstDigit <= '8';
}

/** Parse to a result object. Never throws; the caller decides whether an invalid number is fatal. */
export function parsePhone(raw: string): PhoneResult {
  const canon = canonicalise(raw);
  if (canon === null || canon.digits === '') return { valid: false, error: 'empty' };
  const { plus, digits } = canon;

  if (plus) {
    if (digits.length > 15) return { valid: false, error: 'too-long' }; // E.164 ceiling
    if (!digits.startsWith(SA_COUNTRY_CODE)) return { valid: false, error: 'not-sa-country-code' };
    const national = digits.slice(SA_COUNTRY_CODE.length);
    if (national.length < 9) return { valid: false, error: 'too-short' };
    if (national.length > 9) return { valid: false, error: 'too-long' };
    if (!isValidSaNationalPrefix(national[0]!)) return { valid: false, error: 'invalid-sa-prefix' };
    return { valid: true, e164: `+${SA_COUNTRY_CODE}${national}`, national };
  }

  // National (no '+'): must carry the trunk zero.
  if (digits[0] !== '0') return { valid: false, error: 'missing-trunk-zero' };
  const national = digits.slice(1);
  if (national.length < 9) return { valid: false, error: 'too-short' };
  if (national.length > 9) return { valid: false, error: 'too-long' };
  if (!isValidSaNationalPrefix(national[0]!)) return { valid: false, error: 'invalid-sa-prefix' };
  return { valid: true, e164: `+${SA_COUNTRY_CODE}${national}`, national };
}

/** Normalise to E.164, throwing a descriptive error when the number is not a valid ZA subscriber. */
export function toE164(raw: string): string {
  const result = parsePhone(raw);
  if (!result.valid) throw new TypeError(`formatPhone: not a valid South African number (${result.error})`);
  return result.e164;
}

/**
 * Public `formatPhone`: returns the E.164 form, the canonical value the app stores and dials. It is
 * the throwing variant on purpose — a form that calls this has already validated the number through
 * `parsePhone`, and reaching `formatPhone` with a bad number is a defect, not user input.
 */
export function formatPhone(raw: string): string {
  return toE164(raw);
}

/** Human dial-friendly national form for display: `082 123 4567` (grouped as 3-3-4 after the zero). */
export function formatPhoneNational(raw: string): string {
  const result = parsePhone(raw);
  if (!result.valid) throw new TypeError(`formatPhoneNational: not a valid South African number (${result.error})`);
  const n = result.national; // 9 digits
  return `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 9)}`;
}
