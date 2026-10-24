/**
 * Run a compiled schema over a value map.
 *
 * The pipeline per field is fixed and in this order, because the order is the security property:
 *
 *   1. `coerce` — invisibles and controls are stripped, separators normalised, type applied.
 *   2. `sanitise` — the security findings from step 1, kept even when every rule passes.
 *   3. rules, in declaration order, first failure wins.
 *   4. server errors from the current submit generation, which outrank the client's verdict.
 *
 * Step 2 is the one that is easy to skip and is why `optionalText` counts *visible* length: a
 * 30-character title padded to 220 with zero-widths must fail on the cleaned value, not on the
 * bytes.
 */

import { coerce } from './coerce.js';
import type { CompiledField, CompiledSchema } from './schema.js';
import { sanitise } from './deploit.js';
import type { ApiErrorShape, NormalizedFieldError, NormalizedFormError } from './errors.js';
import { mergeFieldErrors } from './errors.js';
import type { FieldValueShape, FormValues } from './types.js';

export interface FieldOutcome {
  readonly field: string;
  readonly value: FieldValueShape;
  /** Set by a rule failure or by a server code bound to this field; filled in after the loop. */
  error?: NormalizedFieldError | undefined;
  warnings: NormalizedFieldError[];
  skippedExpensive: boolean;
}

export interface ValidationRun {
  readonly outcomes: readonly FieldOutcome[];
  readonly errors: readonly NormalizedFieldError[];
  readonly warnings: readonly NormalizedFieldError[];
  readonly values: FormValues;
  readonly valid: boolean;
}

export interface ValidateOptions {
  /** When false, rules marked `expensive` do not run — the per-keystroke path. */
  readonly includeExpensive?: boolean;
  /** Restrict to these fields (blur / change of one field). Empty means all. */
  readonly only?: readonly string[];
  /** Server errors currently attached to this submit generation. */
  readonly serverErrors?: readonly ApiErrorShape[];
  readonly generation?: number;
  /** Whether the schema's `dependsOn` targets are included in `only`. */
  readonly followDependencies?: boolean;
}

function targetsOf(schema: CompiledSchema, only: readonly string[]): string[] {
  if (only.length === 0) return schema.fields.map((f) => f.name);
  const out = new Set<string>(only);
  for (const field of only) {
    for (const dep of schema.dependsOn[field] ?? []) out.add(dep);
  }
  return schema.fields.filter((f) => out.has(f.name)).map((f) => f.name);
}

export function validateForm(
  schema: CompiledSchema,
  values: FormValues,
  options: ValidateOptions = {},
): ValidationRun {
  const includeExpensive = options.includeExpensive !== false;
  const only = options.only ?? [];
  const names = options.followDependencies === false ? only : targetsOf(schema, only);
  const generation = options.generation ?? 0;

  const nextValues: FormValues = { ...values };
  const outcomes: FieldOutcome[] = [];
  const clientErrors: NormalizedFieldError[] = [];
  const warningErrors: NormalizedFieldError[] = [];
  let skippedExpensive = false;

  const get = (path: string): FieldValueShape => nextValues[path];

  for (const compiled of schema.fields) {
    if (!names.includes(compiled.name)) continue;
    const raw = values[compiled.name];
    const field = compiled.field;

    let value: FieldValueShape = raw;
    if (field.sanitise !== false) {
      const coerced =
        compiled.kind === 'boolean'
          ? coerce(raw, 'boolean')
          : compiled.kind === 'opaque'
            ? { value: raw ?? undefined }
            : typeof raw === 'string'
              ? coerce(raw, compiled.kind, { multiline: field.multiline })
              : coerce(raw, compiled.kind);
      value = coerced.value;
      const failed = 'failed' in coerced ? coerced.failed : undefined;
      if (failed !== undefined && failed !== 'empty' && raw !== '' && raw !== undefined) {
        clientErrors.push({
          field: compiled.name,
          issue: {
            code: failed === 'negative' ? 'validation.price.range' : failed === 'too_precise' ? 'validation.price.format' : 'validation.number.format',
            params: { value: raw ?? '' },
          },
          origin: 'client',
          generation: 0,
        });
      }
    }
    nextValues[compiled.name] = value;

    const report = typeof raw === 'string' ? sanitise(raw, { multiline: field.multiline }) : undefined;
    const securityIssues = (report?.issues ?? []).filter((i) => i.level !== 'warning' && i.code !== 'security.nbsp');
    const infoIssues = (report?.issues ?? []).filter((i) => i.code === 'security.nbsp' || i.level === 'warning');

    for (const issue of securityIssues) {
      clientErrors.push({ field: compiled.name, issue, origin: 'client', generation: 0 });
    }
    for (const issue of infoIssues) {
      warningErrors.push({ field: compiled.name, issue, origin: 'client', generation: 0 });
    }

    if (securityIssues.length === 0) {
      for (const rule of compiled.rules) {
        const result = rule(value, get);
        if (result === null || result === undefined) continue;
        if (result.expensive === true && !includeExpensive) {
          skippedExpensive = true;
          continue;
        }
        if (result.kind === 'fail' && result.code !== undefined) {
          const error: NormalizedFieldError = {
            field: compiled.name,
            issue: { code: result.code, params: result.params, level: result.level },
            origin: 'client',
            generation: 0,
          };
          if (result.level === 'warning') warningErrors.push(error);
          else clientErrors.push(error);
          break;
        }
      }
    }

    outcomes.push({ field: compiled.name, value, warnings: [], skippedExpensive: false });
  }

  const serverMapped: NormalizedFieldError[] = [];
  const formErrors: NormalizedFormError[] = [];
  for (const api of options.serverErrors ?? []) {
    const target = api.field !== undefined ? schema.byName[api.field] : undefined;
    if (target !== undefined) {
      serverMapped.push({
        field: api.field!,
        issue: { code: api.code, params: api.params, level: api.level ?? 'error' },
        origin: 'server',
        generation,
      });
    } else {
      formErrors.push({
        issue: { code: api.code, params: api.params, level: api.level ?? 'error' },
        origin: 'server',
        generation,
      });
    }
  }

  const merged = mergeFieldErrors(clientErrors, serverMapped);
  for (const outcome of outcomes) {
    const error = merged.find((e) => e.field === outcome.field);
    if (error !== undefined) outcome.error = error;
    outcome.warnings = warningErrors.filter((w) => w.field === outcome.field);
    outcome.skippedExpensive = skippedExpensive;
  }

  return {
    outcomes,
    errors: merged,
    warnings: warningErrors,
    values: nextValues,
    valid: merged.length === 0,
  };
}

/** One field only — the blur path. Returns the error, or undefined when the field is acceptable. */
export function validateField(
  schema: CompiledSchema,
  values: FormValues,
  field: string,
  options: Omit<ValidateOptions, 'only'> = {},
): { readonly error?: NormalizedFieldError | undefined; readonly value: FieldValueShape } {
  const run = validateForm(schema, values, { ...options, only: [field] });
  const outcome = run.outcomes.find((o) => o.field === field);
  return { error: outcome?.error, value: outcome?.value ?? values[field] };
}

export function compiledFieldNames(schema: CompiledSchema): readonly string[] {
  return schema.fields.map((f: CompiledField) => f.name);
}
