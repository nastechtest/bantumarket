/**
 * The error taxonomy, as codes only.
 *
 * This file is a contract in the same way `packages/api-contracts` is: `@nastech/i18n` (built
 * concurrently, so not importable here) must provide a rendering for every member, in every locale
 * it ships. Adding a code is a breaking change for that package, which is the point of listing them
 * in one place instead of scattering string literals through the rules.
 *
 * Three families, kept separate because they heal differently:
 *  - `validation.*`  — the user's input is wrong; fixable by typing.
 *  - `security.*`    — the input *looks* manipulated; fixable by typing, but also reported upward.
 *  - `server.*`      — the server disagreed; never overwritten by a client re-validation.
 * Plus `form.*` for whole-form states that are not any one field's fault.
 */

export const VALIDATION_CODES = [
  'validation.required',
  'validation.email.invalid',
  'validation.email.local_too_long',
  'validation.phone.za.invalid',
  'validation.phone.za.country_code',
  'validation.password.length',
  'validation.password.class',
  'validation.password.common',
  'validation.password.same_as_field',
  'validation.text.length',
  'validation.text.max_words',
  'validation.text.control_chars',
  'validation.price.format',
  'validation.price.range',
  'validation.price.min',
  'validation.price.max',
  'validation.postcode.za.invalid',
  'validation.one_of',
  'validation.number.format',
  'validation.number.range',
  'validation.number.integer',
  'validation.quantity.range',
  'validation.date.invalid',
  'validation.consent.required',
  'validation.match',
  'validation.schema.missing_rule',
  'validation.schema.duplicate_field',
] as const;

/** Security findings. Same user-facing fix as a validation error; different *handling*. */
export const SECURITY_CODES = [
  'security.zero_width',
  'security.bidi_override',
  'security.homoglyph_prefix',
  'security.nbsp',
  'security.control_chars',
] as const;

export const FORM_CODES = [
  'form.invalid_fields',
  'form.submit_in_flight',
  'form.no_changes',
  'form.unhandled_server_error',
  'form.session_expired',
  'form.rate_limited',
] as const;

/**
 * Strings a screen reader must hear. `a11y.ts` passes these as issue codes so the announcement
 * path is the same one field errors use — an app that renders field errors but not these has an
 * unannounced error region, which is the failure this package is supposed to make impossible.
 */
export const ANNOUNCEMENT_CODES = [
  'announce.first_error',
  'announce.error_count',
  'announce.submit_succeeded',
  'announce.submit_failed',
] as const;

/**
 * Server codes as the PHP ledger names them. Deliberately a frozen list: an unknown code must fall
 * through to `form.unhandled_server_error` on the *form* level rather than silently bind to a
 * field, because guessing which field a server meant sends the user to fix the wrong input.
 */
export const SERVER_CODES = [
  'validation.required',
  'email_invalid',
  'email_taken',
  'phone_invalid',
  'price_invalid',
  'price_too_low',
  'price_too_high',
  'title_too_long',
  'description_too_long',
  'postcode_invalid',
  'password_too_weak',
  'consent_required',
  'quantity_invalid',
  'invalid_state',
  'unauthorised',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'idempotency_conflict',
] as const;

export type KnownCode =
  | (typeof VALIDATION_CODES)[number]
  | (typeof SECURITY_CODES)[number]
  | (typeof FORM_CODES)[number]
  | (typeof ANNOUNCEMENT_CODES)[number];

const KNOWN = new Set<string>([
  ...VALIDATION_CODES,
  ...SECURITY_CODES,
  ...FORM_CODES,
  ...ANNOUNCEMENT_CODES,
]);

/**
 * True when a renderer will have a translation for this code. Useful in development; a test in
 * `errors.test`-land should fail the build if a rule emits a code that is not in the lists above.
 */
export function isKnownCode(code: string): boolean {
  return KNOWN.has(code);
}

/** Codes that must disable a submit rather than merely warn, whatever a rule's `level` said. */
const SECURITY_BLOCKING: ReadonlySet<string> = new Set<string>(SECURITY_CODES);

export function isSecurityCode(code: string): boolean {
  return SECURITY_BLOCKING.has(code);
}
