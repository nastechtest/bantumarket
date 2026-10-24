/**
 * South African phone number handling, plus international numbers as data.
 *
 * Rules this module encodes, in priority order:
 * 1. Phone-first is the product: an OTP to a mobile number must be enough to register and buy.
 * 2. `+27` is the default country. SA national format (`0XX XXX XXXX`) normalises to `+27XX...`.
 * 3. Never guess a country code. Eleven bare digits starting `0` are unambiguously SA national
 *    trunk format; nine bare digits with no `0` and no `+` are ambiguous and get rejected with a
 *    message that asks for `+27`, not a silent assumption.
 * 4. SMS OTP delivery only works on mobile ranges. SA mobile is `+27 6|7|8` + 8 digits. A
 *    geographic line (`+27 11…`) is a real number but cannot receive an SMS OTP, and saying so
 *    honestly beats accepting it and failing at send time.
 */

const DIGITS_AND_PLUS = /[^\d+]/g;

export interface ParsedPhone {
  readonly ok: boolean;
  /** E.164 (`+` + country code + subscriber), only when ok. */
  readonly e164?: string;
  /** Human message when not ok. Never contains a "guessed" number. */
  readonly error?: string;
  readonly kind?: 'sa-mobile' | 'international';
}

/**
 * Normalise the way a buyer actually types: `082 123 4567`, `+27821234567`, `27821234543`,
 * `0027 82 123 4567`, `(082) 123-4567`. Returns a ParsedPhone; ambiguous shapes are rejected,
 * not repaired.
 */
export function parsePhone(rawInput: string): ParsedPhone {
  const cleaned = rawInput.replace(DIGITS_AND_PLUS, '');
  if (cleaned === '' || cleaned === '+') {
    return { ok: false, error: 'Enter a mobile number so we can text you a code.' };
  }

  // `00` international prefix is just a `+` typed the way people dial it.
  const normalised = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;

  if (!normalised.startsWith('+')) {
    // SA national trunk format: 10 digits, leading 0. Unambiguous — 0 is never a country code.
    if (/^0\d{9}$/.test(normalised)) {
      return finishSa(`+27${normalised.slice(1)}`);
    }
    // `27…` without the plus: still unambiguous, the country code is typed on purpose.
    if (/^27\d{9}$/.test(normalised)) {
      return finishSa(`+${normalised}`);
    }
    return {
      ok: false,
      error: 'Start with 0 (like 082 123 4567) or with +27. We will not guess your country code.',
    };
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalised)) {
    if (/^\+27/.test(normalised)) return finishSa(normalised);
    return { ok: false, error: 'That is not a complete number — international numbers are 8 to 15 digits after the +.' };
  }

  if (normalised.startsWith('+27')) return finishSa(normalised);
  // International numbers are accepted as data. We do not model every country's mobile ranges;
  // delivery is the carrier's answer, and the UI says so instead of pretending to know.
  return { ok: true, e164: normalised, kind: 'international' };
}

function finishSa(e164: string): ParsedPhone {
  const rest = e164.slice(3);
  if (!/^\d{9}$/.test(rest)) {
    return { ok: false, error: 'South African numbers have 9 digits after +27 (10 after 0).' };
  }
  if (!/^[678]/.test(rest)) {
    return {
      ok: false,
      error: 'That is a landline or special number. Sign-in codes arrive by SMS, so we need a mobile number.',
    };
  }
  return { ok: true, e164, kind: 'sa-mobile' };
}

/** `+27821234567` → `+27 82 123 4567`; other E.164 grouped 3-3-4 from the end of the subscriber. */
export function formatPhone(e164: string): string {
  if (e164.startsWith('+27')) {
    const d = e164.slice(3);
    return `+27 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  }
  const cc = e164.match(/^\+\d{1,3}/)?.[0] ?? '+';
  const rest = e164.slice(cc.length);
  const groups: string[] = [];
  for (let i = rest.length; i > 0; i -= 3) groups.unshift(rest.slice(Math.max(0, i - 3), i));
  return [cc, ...groups].join(' ');
}

/**
 * Mask for display and logs. A buyer's full number is personal information under POPIA; the
 * "we sent a code to…" line only ever needs enough to recognise the number.
 */
export function maskPhone(e164: string): string {
  if (e164.startsWith('+27')) {
    const d = e164.slice(3);
    return `+27 ${d.slice(0, 2)} ••• ${d.slice(-2)}`;
  }
  const cc = e164.match(/^\+\d{1,3}/)?.[0] ?? '+';
  const rest = e164.slice(cc.length);
  return `${cc} ${'•'.repeat(Math.max(0, rest.length - 2))}${rest.slice(-2)}`;
}

export function isSaMobile(e164: string): boolean {
  return /^\+27[678]\d{8}$/.test(e164);
}
