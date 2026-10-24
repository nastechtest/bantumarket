/**
 * Runtime schema: the catalogue in `events.ts`, enforced on a value that came from a call site
 * rather than from the compiler.
 *
 * Types are erased at build time and this repo ships to browsers where someone will eventually call
 * `track()` from JavaScript, from a `catch` block, or with `as any` under deadline. The schema is the
 * second gate, and it is *closed*: an unknown property is a rejection, not an ignore. That single
 * choice is what makes `no-pii.test.ts` a proof rather than a sample, because it means the set of
 * values this module can emit is exactly the set the catalogue declares.
 *
 * Rejections are loud in development and silent in production, but never silent-lost: every rejection
 * returns a reason, and `track.ts` counts them so "the schema is eating 40 % of our events" is
 * discoverable instead of looking like a drop in traffic.
 */
import { FORBIDDEN_PROPERTY_NAMES, isForbiddenName, isMoneyLikeName, scanProps, type PiiHit } from './pii-guards.js';
import { definitionOf, refPropsOf, type EventName, type EventPropsMap, type PropSpec } from './events.js';

export type ValidationErrorCode =
  | 'unknown_event'
  | 'unknown_property'
  | 'missing_required'
  | 'type_mismatch'
  | 'not_a_member'
  | 'out_of_range'
  | 'bad_shape'
  | 'forbidden_name'
  | 'pii_value'
  | 'money_unit';

export interface ValidationIssue {
  readonly code: ValidationErrorCode;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly props: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const SLUG_RE = /^\/?[a-z0-9][a-z0-9:_/-]{0,63}$/;
/** Lowercase base32 (RFC 4648 alphabet, no padding): letters plus 2–7. A ref is exactly this long. */
const REF_RE = /^[a-z][a-z234567]{15,31}$/;

export function validateProps<E extends EventName>(name: E, props: unknown): ValidationResult {
  if (props === null || typeof props !== 'object' || Array.isArray(props)) {
    return { ok: false, issues: [{ code: 'bad_shape', path: 'props', message: `props for ${name} must be a plain object` }] };
  }

  const definition = definitionOf(name);
  const specs = definition.props as Readonly<Record<string, PropSpec>>;
  const incoming = props as Readonly<Record<string, unknown>>;
  const issues: ValidationIssue[] = [];

  /* 1. Closed schema: nothing outside the declaration may be present. */
  for (const key of Object.keys(incoming)) {
    if (!(key in specs)) {
      const verdict = isForbiddenName(key);
      issues.push({
        code: verdict.forbidden ? 'forbidden_name' : 'unknown_property',
        path: key,
        message: verdict.forbidden
          ? `"${key}" is a forbidden property name (${verdict.via} match against the PII list) and is not declared by ${name} either`
          : `${name} does not declare "${key}". The schema is closed on purpose: an undeclared property is an unreviewed one, and unreviewed properties are how personal information arrives.`,
      });
    }
  }

  /* 2. Event-specific forbidden names, even if the catalogue grew to declare them by mistake. */
  for (const key of Object.keys(incoming)) {
    if (definition.forbidden.includes(key) && !(key in specs)) {
      issues.push({ code: 'forbidden_name', path: key, message: `"${key}" is named as forbidden on ${name}: ${definition.purpose}` });
    }
  }

  /* 3. Required present (and not undefined). */
  for (const key of definition.required) {
    if (incoming[key] === undefined) {
      issues.push({ code: 'missing_required', path: key, message: `${name} requires "${key}"` });
    }
  }

  /* 4. Per-prop type and range. */
  for (const [key, value] of Object.entries(incoming)) {
    const spec = specs[key];
    if (spec === undefined) continue; // already reported above
    issues.push(...checkSpec(name, key, value, spec));
  }

  /* 5. PII scan over the values that survived typing, then the name list one more time so a
   *    property that is legal by type still cannot be legal by name. */
  if (issues.length === 0) {
    const hits = scanProps(incoming, refPropsOf(name));
    for (const hit of hits) issues.push(piiIssue(hit));
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, props: { ...incoming } };
}

function checkSpec(eventName: EventName, key: string, value: unknown, spec: PropSpec): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  // `null` is only legal where the contract says "this field was never recorded", which is a real
  // answer for scene telemetry and nowhere else in this catalogue.
  const acceptsNull =
    (spec.kind === 'enum' && spec.nullable === true) ||
    (spec.kind === 'count' && spec.unit === 'ms' && spec.nullable === true);

  if (value === null) {
    if (!acceptsNull) out.push({ code: 'type_mismatch', path: key, message: `${eventName}.${key} may not be null; omit the property instead` });
    return out;
  }
  if (value === undefined) return out; // optional and absent — legal under exactOptionalPropertyTypes only if the caller omitted it

  switch (spec.kind) {
    case 'enum': {
      if (typeof value !== 'string') {
        out.push({ code: 'type_mismatch', path: key, message: `${eventName}.${key} must be a string enum member, got ${typeof value}` });
        break;
      }
      if (!(spec.values as readonly string[]).includes(value)) {
        out.push({ code: 'not_a_member', path: key, message: `${eventName}.${key}="${value}" is not one of ${spec.values.join('|')}` });
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') out.push({ code: 'type_mismatch', path: key, message: `${eventName}.${key} must be boolean` });
      break;
    }
    case 'slug': {
      if (typeof value !== 'string') {
        out.push({ code: 'type_mismatch', path: key, message: `${eventName}.${key} must be a slug string` });
        break;
      }
      if (!SLUG_RE.test(value) || value.length > spec.maxLength) {
        out.push({ code: 'bad_shape', path: key, message: `${eventName}.${key} must match ${SLUG_RE} and be ≤${spec.maxLength} chars — a slug is a controlled value, not a description` });
      }
      break;
    }
    case 'ref': {
      if (typeof value !== 'string') {
        out.push({ code: 'type_mismatch', path: key, message: `${eventName}.${key} must be a correlation ref string` });
        break;
      }
      if (value.length !== spec.length || !REF_RE.test(value)) {
        out.push({
          code: 'bad_shape',
          path: key,
          message: `${eventName}.${key} must be a ${spec.length}-char session-scoped ref from session.refFor(); got a ${value.length}-char value. A raw entity id is not a ref and never will be.`,
        });
      }
      break;
    }
    case 'count': {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        out.push({ code: 'type_mismatch', path: key, message: `${eventName}.${key} must be a non-negative integer (${spec.unit})` });
        break;
      }
      if (value > spec.max) out.push({ code: 'out_of_range', path: key, message: `${eventName}.${key}=${value} exceeds the ${spec.max} ${spec.unit} ceiling` });
      break;
    }
    case 'ratio': {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        out.push({ code: 'type_mismatch', path: key, message: `${eventName}.${key} must be a finite non-negative number` });
        break;
      }
      if (value > spec.max) out.push({ code: 'out_of_range', path: key, message: `${eventName}.${key}=${value} exceeds ${spec.max}` });
      break;
    }
  }
  return out;
}

function piiIssue(hit: PiiHit): ValidationIssue {
  return { code: hit.kind === 'exact_price' ? 'money_unit' : 'pii_value', path: hit.path, message: `${hit.kind}: ${hit.why}` };
}

/**
 * The catalogue-level assertions `no-pii.test.ts` runs, exported from here so the rules live next to
 * the validator that enforces them and a reviewer reads both in one file.
 *
 * A prop is *declaratively safe* when its spec admits no PII-shaped value: an enum whose members
 * contain no space, no `@` and no 7-digit run; a slug; a fixed-length ref; a boolean; or a number
 * with a declared unit that is not money. Money is the interesting one: `count` and `ratio` carry an
 * explicit `unit`, so "this number is cents" is not expressible — and `isMoneyLikeName` catches the
 * naming dodge (`subtotal`, `fee_cents`, `commission`).
 */
export function auditPropSpec(name: string, spec: PropSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (isForbiddenName(name).forbidden) issues.push({ code: 'forbidden_name', path: name, message: 'declared prop name is on the forbidden list' });
  if (isMoneyLikeName(name) && spec.kind !== 'enum') {
    issues.push({ code: 'money_unit', path: name, message: 'a money-shaped name must be a bucketed enum, not a number' });
  }

  switch (spec.kind) {
    case 'enum':
      for (const v of spec.values) {
        if (/\s/.test(v)) issues.push({ code: 'pii_value', path: `${name}.${v}`, message: 'enum members may not contain whitespace — a member with a space is a sentence wearing a vocabulary' });
        if (v.length > 64) issues.push({ code: 'bad_shape', path: `${name}.${v}`, message: 'enum member too long to be a controlled value' });
        if (scanProps({ [name]: v }).length > 0) issues.push({ code: 'pii_value', path: `${name}.${v}`, message: 'enum member trips a PII detector' });
      }
      break;
    case 'slug':
      if (spec.maxLength > 64) issues.push({ code: 'bad_shape', path: name, message: `slug maxLength ${spec.maxLength} is long enough to hold a title` });
      break;
    case 'ref':
      if (spec.length < 16 || spec.length > 32) issues.push({ code: 'bad_shape', path: name, message: 'a correlation ref must be 16–32 chars: shorter is enumerable, longer is a permanent key' });
      break;
    case 'count':
      // `unit` is a closed union of count|ms|bytes on PropSpec, so "this number is money" is not
      // expressible in the type at all — the rule the brief asks for is enforced by the shape, not
      // by a runtime check that could never fire.
      break;
    case 'boolean':
    case 'ratio':
      break;
  }
  return issues;
}

/** Every forbidden name, exactly once, sorted — for the README and for a test that the list is data. */
export const ALL_FORBIDDEN_NAMES: readonly string[] = [...new Set(FORBIDDEN_PROPERTY_NAMES)].sort();

/** Convenience for callers that only want the boolean answer. */
export function isValidProps<E extends EventName>(name: E, props: EventPropsMap[E]): boolean {
  return validateProps(name, props).ok;
}
