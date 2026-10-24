// CONTRACT-GAP: local field/validation helpers. `@nastech/forms` is being written concurrently and
// is empty right now; at integration these rule functions should be swapped for its schema layer
// (same call sites: methods/*.tsx). The rule SHAPE is what we want the forms package to keep:
// pure (value) => error | undefined, composable, nothing here knows about React.
//
// What these fields validate is contact/reservation data ONLY. Card number, expiry, CVV and any
// payment token are NOT modeled anywhere in this feature — they live on the provider-hosted
// surface and never enter this app's state, storage, or logs (brief: "no PAN ever touches your
// state or your logs").

export type FieldRule = (value: string) => string | undefined;

export function required(label: string): FieldRule {
  return (value) => (value.trim() === '' ? `${label} is required.` : undefined);
}

/**
 * Receipt email: shape only, no deliverability claim. Deliberately not a full RFC regex — the
 * provider surface owns payment identity; here an email is a receipt address and over-strict
 * validation is a checkout abandonment cause.
 */
export function email(): FieldRule {
  return (value) => {
    const trimmed = value.trim();
    if (trimmed === '') return undefined; // pair with required() when mandatory
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? undefined : 'That does not look like an email address.';
  };
}

/**
 * South African mobile: 0XX XXX XXXX or 27XX XXX XXXX, 9 digits after the prefix, 10 total.
 * Instant-EFT sends the buyer a push on their phone, so a malformed number is a failed payment,
 * not a cosmetic problem — hence digits-only normalisation before the length test.
 */
export function saMobile(): FieldRule {
  return (value) => {
    const digits = value.replace(/[\s()-]/g, '');
    if (digits === '') return undefined;
    if (!/^\d+$/.test(digits)) return 'A phone number should only contain digits.';
    const local = digits.startsWith('27') ? `0${digits.slice(2)}` : digits;
    if (/^0[1-8]\d{8}$/.test(local)) return undefined;
    return 'Use a South African mobile number, like 082 123 4567.';
  };
}

/** SA postcodes are 4 digits; pilot is one city, but cash-on-handover meets-up sorting needs the code. */
export function postcode(): FieldRule {
  return (value) => {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    return /^\d{4}$/.test(trimmed) ? undefined : 'A South African postcode is 4 digits.';
  };
}

export function maxLength(max: number): FieldRule {
  return (value) => (value.length > max ? `Keep this under ${String(max)} characters.` : undefined);
}

export function compose(...rules: readonly FieldRule[]): FieldRule {
  return (value) => {
    for (const rule of rules) {
      const error = rule(value);
      if (error !== undefined) return error;
    }
    return undefined;
  };
}

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

/** First-error-per-field; a form reports all at once so a buyer fixes the page in one pass. */
export function validateFields<T extends string>(
  values: Readonly<Record<T, string>>,
  rules: Readonly<Record<T, readonly FieldRule[]>>,
): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const key of Object.keys(rules) as T[]) {
    const fieldRules = rules[key];
    if (fieldRules === undefined) continue;
    const error = compose(...fieldRules)(values[key] ?? '');
    if (error !== undefined) errors[key] = error;
  }
  return errors;
}

export function hasErrors(errors: FieldErrors<string> | Record<string, string | undefined>): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}
