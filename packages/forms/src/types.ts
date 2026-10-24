/**
 * The whole vocabulary of this package in one file, so `rules.ts`, `validate.ts` and `errors.ts`
 * can import each other's types without a cycle.
 *
 * Every user-facing string that leaves validation is a `FormIssue`: a code plus params. There is
 * deliberately no prose anywhere in this package's output. `@nastech/i18n` renders codes into the
 * user's language; if validation guessed a sentence, the translation layer would have to undo that
 * guess to do its job.
 */

/** A validation rule's identity. Open-ended so a feature can add its own rules. */
export type RuleName = string;

export interface IssueParams {
  readonly [key: string]: string | number | boolean | readonly (string | number)[] | undefined;
}

/** `min`/`max` carry the unit the renderer needs to phrase the limit correctly. */
export type LimitUnit = 'characters' | 'items' | 'percent' | 'rands' | 'years' | 'words';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface FormIssue {
  readonly code: string;
  readonly params?: IssueParams | undefined;
  readonly level?: IssueLevel | undefined;
}

/** Where an issue came from. `server` must never be overwritten by a client re-run. */
export type IssueOrigin = 'client' | 'server';

export type FieldValue =
  | string
  | number
  | boolean
  | undefined
  | readonly string[]
  | readonly number[]
  | null;

/** `null` is a value here (an explicit "none"); `undefined` means "not filled in yet". */
export type FieldValueShape = string | number | boolean | readonly (string | number)[] | null | undefined;

/**
 * The whole form's data, keyed by dotted path (`'contact.email'`). Fields are stored flat rather
 * than nested so a checkout form and a 40-field listing form pay the same lookup cost.
 */
export type FormValues = Record<string, FieldValueShape>;

/** Declared error codes with no prose. See `codes.ts` for the contract on this list. */
export type ValidationErrorCode = string;

/** One rule's outcome for one field. */
export interface RuleResult {
  readonly kind: 'pass' | 'fail';
  readonly code?: string | undefined;
  readonly params?: IssueParams | undefined;
  readonly level?: IssueLevel | undefined;
  /** Expensive rules (remote checks, regexes that can backtrack) never run per keystroke. */
  readonly expensive?: boolean | undefined;
}

export type FieldNameOf<S> = S extends { readonly fields: infer F } ? keyof F & string : never;

/**
 * A validation function for one field. `get` is the whole value map — a confirm-password rule and a
 * price-range rule both need a sibling's value, and a rule that cannot see its neighbours cannot
 * validate a form.
 */
export type FieldRule<V = FieldValueShape> = (
  value: V,
  get: (path: string) => FieldValueShape,
) => RuleResult | null | undefined;

export interface RuleRef {
  readonly name: RuleName;
  readonly options?: IssueParams;
}
