/**
 * A small declarative field spec — no dependencies, and deliberately not JSON Schema.
 *
 * A feature agent writes this once per form and gets the rule set, the coercion, the a11y ids and
 * the server-error binding from one object. It is not a general validator: there is no `$ref`, no
 * conditional subschema, no format registry. The marketplace has ~25 shapes and they all fit in
 * `fields[]` plus `dependsOn`. When a form genuinely needs more, `custom` gives it a function, which
 * is honest about the escape hatch rather than pretending the DSL scales.
 *
 * Server error binding lives on the field, not in a separate map, because that is the one thing
 * every feature agent would otherwise get wrong: the API says `email_taken`, the form has
 * `contactEmail`, and a mapping table two files away always drifts.
 */

import type { FieldRule, IssueParams } from './types.js';
import { ruleCatalog, type RequiredOptions, type PasswordOptions, type PriceRangeOptions, type OptionalTextOptions, type QuantityOptions } from './rules.js';

export type FieldKind = 'string' | 'number' | 'integer' | 'money' | 'boolean' | 'csv' | 'digits' | 'opaque';

export interface RuleSpec {
  readonly name: string;
  readonly options?: IssueParams | undefined;
}

export interface FieldSchema {
  readonly name: string;
  readonly kind?: FieldKind | undefined;
  /** Multiline changes which invisible characters are legitimate (`\n`) and how runs collapse. */
  readonly multiline?: boolean | undefined;
  /** Default true: invisibles and controls are stripped before any rule sees the value. */
  readonly sanitise?: boolean | undefined;
  readonly required?: boolean | RequiredOptions | undefined;
  readonly rules?: readonly (RuleSpec | FieldRule)[] | undefined;
  /** `maxLength` is a hard input cap as well as a rule — a 3000-character title is not a typo. */
  readonly maxLength?: number | undefined;
  readonly minLength?: number | undefined;
  readonly maxWords?: number | undefined;
  readonly allowed?: readonly (string | number)[] | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly accepts?: readonly string[] | undefined;
  readonly serverCodes?: readonly string[] | undefined;
  readonly custom?: FieldRule | undefined;
  readonly description?: string | undefined;
  readonly label?: string | undefined;
}

export interface FormSchema {
  readonly id: string;
  readonly fields: readonly FieldSchema[];
  /**
   * Fields to re-validate when this one changes. A checkout needs `qty` recomputed when `stock`
   * moves; without it, a stale "only 2 left" error survives the change that fixed it.
   */
  readonly dependsOn?: Readonly<Record<string, readonly string[]>> | undefined;
}

export class SchemaError extends Error {
  override readonly name = 'SchemaError';
}

/** Built-in rule names addressable from `rules: [{name: 'email'}]`. */
const KNOWN_RULES = new Set(Object.keys(ruleCatalog));

function buildRule(spec: RuleSpec | FieldRule, field: FieldSchema): FieldRule {
  if (typeof spec === 'function') return spec;
  const options = spec.options ?? {};
  switch (spec.name) {
    case 'oneOf': {
      const allowed = (options.values ?? field.allowed ?? []) as readonly (string | number)[];
      return ruleCatalog.oneOf(allowed);
    }
    case 'matches':
      return ruleCatalog.matches(String(options.field ?? ''), { caseInsensitive: options.caseInsensitive === true });
    case 'passwordCommon': {
      const checker = options.checker as ((value: string) => boolean) | undefined;
      if (!checker) throw new SchemaError(`rule "passwordCommon" needs options.checker on field "${field.name}"`);
      return (value) => {
        if (isEmptyish(value)) return { kind: 'pass', expensive: true };
        return checker(String(value))
          ? { kind: 'fail', code: 'validation.password.common', expensive: true }
          : { kind: 'pass', expensive: true };
      };
    }
    default: {
      const factory = (ruleCatalog as unknown as Record<string, (o?: unknown) => FieldRule>)[spec.name];
      if (!factory) {
        throw new SchemaError(
          `Unknown rule "${spec.name}" on field "${field.name}". Known: ${[...KNOWN_RULES].join(', ')}. ` +
            'Pass a function or use `custom` for your own.',
        );
      }
      return factory(options);
    }
  }
}

/**
 * Compile a schema into executable rules.
 *
 * Validation is the hot path (every blur, every submit of every form in three apps), so the
 * `FieldSchema` shape is translated once into plain functions here instead of being re-interpreted
 * on every keystroke. It also means schema mistakes throw at module scope, at import time, rather
 * than the first time a user touches the field.
 */
export interface CompiledField {
  readonly name: string;
  readonly field: FieldSchema;
  readonly kind: FieldKind;
  readonly rules: readonly FieldRule[];
  readonly serverCodes: ReadonlySet<string>;
}

export interface CompiledSchema {
  readonly id: string;
  readonly fields: readonly CompiledField[];
  readonly byName: Readonly<Record<string, CompiledField>>;
  readonly dependsOn: Readonly<Record<string, readonly string[]>>;
}

export function compileSchema(schema: FormSchema): CompiledSchema {
  const byName: Record<string, CompiledField> = {};
  const compiled: CompiledField[] = [];

  for (const field of schema.fields) {
    if (byName[field.name] !== undefined) {
      throw new SchemaError(`Duplicate field name "${field.name}" in schema "${schema.id}".`);
    }
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(field.name)) {
      // Dots are allowed for grouping (`contact.email`) and the a11y id builder depends on it.
      throw new SchemaError(`Field name "${field.name}" in schema "${schema.id}" must match ^[A-Za-z][A-Za-z0-9_.]*$.`);
    }

    const rules: FieldRule[] = [];
    if (field.required) {
      rules.push(ruleCatalog.required(field.required === true ? {} : field.required));
    }
    if (field.kind === 'money' || field.accepts?.includes('price')) {
      rules.push(ruleCatalog.priceRange({ min: field.min, max: field.max } as PriceRangeOptions));
    } else if (field.min !== undefined || field.max !== undefined) {
      if (field.kind === 'integer' || field.kind === 'number') {
        rules.push((value) => numberRange(value, field.min, field.max, field.name));
      }
    }
    if (field.minLength !== undefined || field.maxLength !== undefined || field.maxWords !== undefined) {
      const textOptions: OptionalTextOptions = {
        minLength: field.minLength,
        maxLength: field.maxLength,
        maxWords: field.maxWords,
        multiline: field.multiline,
      };
      rules.push(ruleCatalog.optionalText(textOptions));
    }
    if (field.allowed !== undefined) rules.push(ruleCatalog.oneOf(field.allowed));
    for (const spec of field.rules ?? []) rules.push(buildRule(spec, field));
    if (field.custom) rules.push(field.custom);

    byName[field.name] = {
      name: field.name,
      field,
      kind: field.kind ?? 'string',
      rules,
      serverCodes: new Set(field.serverCodes ?? []),
    };
    compiled.push(byName[field.name]!);
  }

  for (const [from, targets] of Object.entries(schema.dependsOn ?? {})) {
    if (byName[from] === undefined) throw new SchemaError(`dependsOn names unknown field "${from}" in "${schema.id}".`);
    for (const to of targets) {
      if (byName[to] === undefined) throw new SchemaError(`dependsOn("${from}") names unknown field "${to}" in "${schema.id}".`);
    }
  }

  return { id: schema.id, fields: compiled, byName, dependsOn: schema.dependsOn ?? {} };
}

/** Password options are carried through `FieldSchema` via `rules`, so keep the export reachable. */
export type { PasswordOptions, QuantityOptions };

function numberRange(value: unknown, min: number | undefined, max: number | undefined, field: string) {
  if (value === undefined || value === null || value === '') return { kind: 'pass' } as const;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
  if (!Number.isFinite(n)) return { kind: 'fail', code: 'validation.number.format', params: { value: String(value), field } } as const;
  if (min !== undefined && n < min) return { kind: 'fail', code: 'validation.number.range', params: { min, actual: n } } as const;
  if (max !== undefined && n > max) return { kind: 'fail', code: 'validation.number.range', params: { max, actual: n } } as const;
  return { kind: 'pass' } as const;
}

function isEmptyish(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
