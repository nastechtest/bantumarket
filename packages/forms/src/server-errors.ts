/**
 * Mapping an API error onto the form.
 *
 * The API answers with `{ code, field?, params? }` (see `packages/api-contracts` for the wire shape;
 * `field` is CONTRACT-GAP — the PHP HTTP layer does not exist yet, so the name below is what this
 * package assumes and what the transport must send). Three rules, each learned from a form that got
 * it wrong:
 *
 *  - Bind to a field ONLY when the field exists in this schema and the code is one that field
 *    declared. Otherwise it goes on the form. Guessing a field sends the user to fix the wrong input.
 *  - `unauthorised` / `forbidden` / `not_found` / `rate_limited` are never field errors. They mean
 *    the request, not the value; marking a field red for a session timeout is a lie about the input.
 *  - An unknown code is reported, not swallowed. Silent swallow is how "the form did nothing" becomes
 *    a support ticket nobody can reproduce.
 */

import { compileSchema, type CompiledSchema } from './schema.js';
import type { ApiErrorShape, NormalizedFieldError, NormalizedFormError } from './errors.js';
import type { FormIssue, IssueParams } from './types.js';

export interface ServerFieldBinding {
  readonly field: string;
  readonly issue: FormIssue;
}

/** Global conditions: the request failed, not the value. */
const FORM_LEVEL_CODES: ReadonlySet<string> = new Set([
  'unauthorised',
  'forbidden',
  'not_found',
  'invalid_state',
  'rate_limited',
  'idempotency_conflict',
  'conflict',
]);

/**
 * Codes whose meaning is a field's value, used when the API helpfully names a field. A field that
 * did not declare the code in `serverCodes` still gets it — this list says "this code *can* belong to
 * a field", not "you must trust the server's field name".
 */
const FIELD_CAPABLE_CODES: ReadonlySet<string> = new Set([
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
]);

/**
 * Server code -> this package's code. Kept tiny on purpose: the PHP ledger uses its own vocabulary,
 * and the i18n layer is what turns a code into words. Translating *here* would mean two places that
 * can disagree about what an error is.
 */
const CODE_ALIASES: Readonly<Record<string, string>> = {
  email_invalid: 'validation.email.invalid',
  email_taken: 'validation.email.invalid',
  phone_invalid: 'validation.phone.za.invalid',
  price_invalid: 'validation.price.format',
  price_too_low: 'validation.price.min',
  price_too_high: 'validation.price.max',
  title_too_long: 'validation.text.length',
  description_too_long: 'validation.text.length',
  postcode_invalid: 'validation.postcode.za.invalid',
  password_too_weak: 'validation.password.length',
  consent_required: 'validation.consent.required',
  quantity_invalid: 'validation.quantity.range',
  'validation.required': 'validation.required',
};

export interface NormalisedServerResponse {
  readonly fieldErrors: readonly NormalizedFieldError[];
  readonly formErrors: readonly NormalizedFormError[];
  /** Codes this package did not recognise — for the console and for the abuse log, never for the user. */
  readonly unknownCodes: readonly string[];
}

/** `api.field` may be a wire name (`contact_email`) or a schema name (`contact.email`). */
function resolveFieldName(raw: string, schema: CompiledSchema): string | undefined {
  if (schema.byName[raw] !== undefined) return raw;
  const dotted = raw.replace(/_/g, '.');
  if (schema.byName[dotted] !== undefined) return dotted;
  const lower = raw.toLowerCase();
  for (const name of Object.keys(schema.byName)) {
    if (name.toLowerCase() === lower || name.toLowerCase().replace(/\./g, '_') === lower) return name;
  }
  return undefined;
}

export function normalizeServerErrors(
  schema: CompiledSchema,
  errors: readonly ApiErrorShape[],
  generation: number,
): NormalisedServerResponse {
  const fieldErrors: NormalizedFieldError[] = [];
  const formErrors: NormalizedFormError[] = [];
  const unknownCodes: string[] = [];

  for (const api of errors) {
    const code = api.code;
    const isFieldCapable = FIELD_CAPABLE_CODES.has(code);
    const isFormLevel = FORM_LEVEL_CODES.has(code);
    const aliased = CODE_ALIASES[code];
    if (aliased === undefined && !isFieldCapable && !isFormLevel) unknownCodes.push(code);

    const issue: FormIssue = {
      code: aliased ?? code,
      params: decorateParams(code, api.params),
      level: api.level ?? 'error',
    };

    const requested = api.field === undefined ? undefined : resolveFieldName(api.field, schema);

    if (isFormLevel) {
      // Even if the server named a field, these codes are about the request. Keep the name as a param
      // so the renderer can offer "open this item" but never mark an input invalid.
      formErrors.push({
        issue: { code: issue.code, params: { ...issue.params, ...(requested ? { field: requested } : {}) }, level: 'error' },
        origin: 'server',
        generation,
      });
      continue;
    }

    if (requested !== undefined && (isFieldCapable || unknownCodes.includes(code) === false)) {
      fieldErrors.push({ field: requested, issue, origin: 'server', generation });
      continue;
    }

    if (isFieldCapable) {
      // The server said a value is wrong but did not say which. Better to show it on the form than to
      // bind it to a guess.
      formErrors.push({
        issue: { code: issue.code, params: { ...issue.params, unnamedField: true }, level: 'error' },
        origin: 'server',
        generation,
      });
      continue;
    }

    formErrors.push({ issue, origin: 'server', generation });
  }

  return { fieldErrors, formErrors, unknownCodes };
}

/**
 * Params the server does not send but the renderer needs. `price_too_low` arrives with no `min`, and
 * an i18n template that reads `{min}` renders "must be at least " with nothing after it — so the
 * schema's declared bound is filled in here, from the schema, not from a guess at render time.
 */
function decorateParams(code: string, params: IssueParams | undefined): IssueParams | undefined {
  if (params === undefined) return undefined;
  const out: Record<string, unknown> = { ...params };
  if (code === 'price_too_low' && out.min === undefined && params.minCents !== undefined) out.min = params.minCents;
  if (code === 'price_too_high' && out.max === undefined && params.maxCents !== undefined) out.max = params.maxCents;
  return out as IssueParams;
}

/**
 * Bind a whole error envelope. Accepts the two shapes the transport may deliver: an array, or
 * `{ errors: [...] }` — PHP's `validation.errors` map becomes an array here.
 */
export function normalizeServerEnvelope(
  schema: CompiledSchema,
  envelope: unknown,
  generation: number,
): NormalisedServerResponse {
  const list = extractApiErrors(envelope);
  return normalizeServerErrors(schema, list, generation);
}

export function extractApiErrors(envelope: unknown): ApiErrorShape[] {
  if (Array.isArray(envelope)) return envelope.filter(isApiErrorShape);
  if (typeof envelope !== 'object' || envelope === null) return [];
  const obj = envelope as Record<string, unknown>;
  if (Array.isArray(obj.errors)) return obj.errors.filter(isApiErrorShape);
  const map = obj.errors ?? obj.fields;
  if (typeof map === 'object' && map !== null && !Array.isArray(map)) {
    const out: ApiErrorShape[] = [];
    for (const [field, value] of Object.entries(map as Record<string, unknown>)) {
      if (typeof value === 'string') out.push({ code: value, field });
      else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') out.push({ code: item, field });
          else if (isApiErrorShape(item)) out.push({ ...item, field });
        }
      }
    }
    return out;
  }
  if (typeof obj.code === 'string') return [{ code: obj.code, field: typeof obj.field === 'string' ? obj.field : undefined }];
  return [];
}

function isApiErrorShape(item: unknown): item is ApiErrorShape {
  return typeof item === 'object' && item !== null && typeof (item as { code?: unknown }).code === 'string';
}

/** Convenience for callers that only have a `FormSchema`, not a compiled one. */
export function normalizeErrorsForSchema(schema: ReturnType<typeof compileSchema>, errors: readonly ApiErrorShape[], generation = 1) {
  return normalizeServerErrors(schema, errors, generation);
}
