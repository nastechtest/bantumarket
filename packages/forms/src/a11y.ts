/**
 * Accessibility wiring — ids, ARIA, and focus.
 *
 * The claim that matters is not "we set aria-invalid"; it is that an error message is *programmatically
 * linked* to the input it describes, so a screen reader that reaches the field announces the failure
 * before the user types, and that after a failed submit the focus is on the thing they must fix.
 * `a11y.test.tsx` proves both against rendered DOM.
 *
 * Two details with teeth:
 *  - `aria-describedby` is an *ordered set*, so it must include the existing description id when an
 *    error appears — otherwise the hint ("we never publish your number") disappears the moment it is
 *    most needed.
 *  - `aria-live` is `assertive` for failed submits and `polite` for a live count: an assertive region
 *    that updates on every keystroke interrupts the user mid-word.
 */

import { ANNOUNCEMENT_CODES } from './codes.js';
import type { FormIssue } from './types.js';

export interface A11yIds {
  readonly input: string;
  readonly label: string;
  readonly description: string;
  readonly error: string;
  readonly status: string;
}

export function a11yIds(formId: string, field: string): A11yIds {
  const safeField = field.replace(/[^a-zA-Z0-9_-]/g, '-');
  const safeForm = formId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return {
    input: `${safeForm}-${safeField}`,
    label: `${safeForm}-${safeField}-label`,
    description: `${safeForm}-${safeField}-description`,
    error: `${safeForm}-${safeField}-error`,
    status: `${safeForm}-status`,
  };
}

export interface A11yPropsInput {
  readonly formId: string;
  readonly field: string;
  readonly hasDescription: boolean;
  readonly hasError: boolean;
  readonly hasWarning: boolean;
  readonly multipleErrors?: boolean | undefined;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly pending?: boolean | undefined;
  readonly type?: 'text' | 'email' | 'tel' | 'password' | 'number' | 'checkbox' | 'radio' | 'textarea' | undefined;
  readonly autocomplete?: string | undefined;
  readonly inputMode?: 'text' | 'email' | 'tel' | 'numeric' | 'decimal' | undefined;
  readonly describedByExtra?: readonly string[] | undefined;
}

/** Plain attribute bag — no JSX, so a Svelte or vanilla app can use the same wiring. */
export type AriaAttrs = Record<string, string | number | boolean | undefined>;

export interface A11yWiring {
  readonly ids: A11yIds;
  readonly input: AriaAttrs;
  readonly label: AriaAttrs;
  readonly error: AriaAttrs;
}

export function a11yProps(input: A11yPropsInput): A11yWiring {
  const ids = a11yIds(input.formId, input.field);
  const describedBy: string[] = [];
  if (input.hasDescription) describedBy.push(ids.description);
  if (input.hasError || input.hasWarning) describedBy.push(ids.error);
  describedBy.push(...(input.describedByExtra ?? []));

  return {
    ids,
    input: {
      id: ids.input,
      name: input.field,
      'aria-labelledby': ids.label,
      ...(describedBy.length > 0 ? { 'aria-describedby': describedBy.join(' ') } : {}),
      'aria-invalid': input.hasError ? true : undefined,
      'aria-required': input.required === true ? true : undefined,
      'aria-busy': input.pending === true ? true : undefined,
      autoComplete: input.autocomplete,
      inputMode: input.inputMode,
      disabled: input.disabled === true ? true : undefined,
      required: input.required === true && input.type !== 'checkbox' ? true : undefined,
    },
    label: { id: ids.label, htmlFor: ids.input },
    error: {
      id: ids.error,
      // Not `role="alert"`: an error that appears while the field already has focus is announced twice
      // (once by the live region, once by the description read on focus). `assertive` on a region the
      // user did not navigate to is the correct half.
      role: 'status',
      'aria-live': input.hasError ? 'assertive' : 'polite',
      'aria-atomic': input.multipleErrors === true ? true : undefined,
    },
  };
}

export interface StatusRegionProps {
  readonly id: string;
  readonly role: 'status' | 'alert';
  readonly 'aria-live': 'polite' | 'assertive';
  readonly 'aria-atomic': true;
}

/**
 * One region per form for whole-form messages. A form with a status region and no error summary is a
 * form where a failed submit is silent to a screen-reader user.
 */
export function statusRegion(formId: string): StatusRegionProps {
  const safeForm = formId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return { id: `${safeForm}-status`, role: 'status', 'aria-live': 'assertive', 'aria-atomic': true };
}

export interface ErrorSummaryProps {
  readonly role: 'alert';
  readonly 'aria-labelledby': string;
  readonly id: string;
  readonly tabIndex: -1;
}

export function errorSummary(formId: string): ErrorSummaryProps {
  const safeForm = formId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return { role: 'alert', id: `${safeForm}-summary`, 'aria-labelledby': `${safeForm}-summary-title`, tabIndex: -1 };
}

/** A link per error in the summary, so keyboard users can jump straight to the field. */
export function summaryLinkFor(formId: string, field: string): AriaAttrs {
  const ids = a11yIds(formId, field);
  return { href: `#${ids.input}`, 'data-form-error-link': ids.input };
}

export interface FocusableField {
  readonly field: string;
  readonly order: number;
  readonly level?: 'error' | 'warning' | 'info' | undefined;
}

/**
 * Focus the first invalid field on submit.
 *
 * Order is *declaration* order (schema order), not error-insertion order — a user who tabs into a
 * form expects the top of the form to be the first problem. Hidden/disabled fields are skipped:
 * focusing something invisible moves the viewport and strands the keyboard user with no anchor, and
 * a disabled field cannot be fixed anyway.
 */
export function focusFirstError(
  document_: Document | undefined,
  formId: string,
  fields: readonly FocusableField[],
  opts?: { readonly reveal?: (field: string) => void; readonly preventScroll?: boolean },
): string | undefined {
  if (document_ === undefined) return undefined;
  const ordered = [...fields].filter((f) => f.level !== 'warning' && f.level !== 'info')
    .sort((a, b) => a.order - b.order);

  for (const candidate of ordered) {
    const ids = a11yIds(formId, candidate.field);
    const el = document_.getElementById(ids.input) as HTMLElement | null;
    if (el === null) continue;
    if (el instanceof HTMLInputElement && el.disabled) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (el.offsetParent === null && el.getClientRects().length === 0) {
      opts?.reveal?.(candidate.field);
    }
    el.focus({ preventScroll: opts?.preventScroll === true });
    // Selecting the text means the fix is a type-over, not a navigate-and-edit. `select` exists on the
    // text-like elements only, hence the narrow.
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
    return candidate.field;
  }
  return undefined;
}

/**
 * Announcement content, as codes. A form that says "please fix 3 fields" in English only is a form
 * that fails an isiZulu user at the one moment it matters, so the caller renders these through the
 * i18n layer exactly like a field error.
 */
export function announcementFor(
  kind: 'error' | 'success' | 'pending',
  opts: { readonly firstError?: FormIssue; readonly errorCount?: number },
): FormIssue {
  if (kind === 'success') return { code: ANNOUNCEMENT_CODES[2], level: 'info' };
  if (kind === 'pending') return { code: ANNOUNCEMENT_CODES[3], level: 'info' };
  const count = opts.errorCount ?? 0;
  if (count <= 1 && opts.firstError !== undefined) return opts.firstError;
  return { code: ANNOUNCEMENT_CODES[1], params: { count } };
}

/** For the test suite: every input inside `root` must be labelled. Returns the failures. */
export function auditLabels(root: Element): { readonly element: string; readonly problem: string }[] {
  const problems: { element: string; problem: string }[] = [];
  const doc = root.ownerDocument;
  const inputs = root.querySelectorAll('input, textarea, select');
  inputs.forEach((node) => {
    const el = node as HTMLInputElement;
    if (el.type === 'hidden') return;
    const id = el.id;
    const describedByIds = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    for (const refId of describedByIds) {
      if (doc !== null && doc.getElementById(refId) === null) {
        problems.push({ element: id || el.name, problem: `aria-describedby references missing id "${refId}"` });
      }
    }
    if (el.type === 'checkbox' || el.type === 'radio') {
      const label = id !== '' && id !== undefined ? doc?.querySelector(`label[for="${id}"]`) : null;
      const wrapped = el.closest('label');
      const ariaLabel = el.getAttribute('aria-label');
      const labelledBy = el.getAttribute('aria-labelledby');
      const hasText =
        (label !== null && label.textContent !== null && label.textContent.trim() !== '') ||
        (wrapped !== null && wrapped !== undefined && wrapped.textContent !== null && wrapped.textContent.trim() !== '') ||
        (ariaLabel !== null && ariaLabel.trim() !== '') ||
        (labelledBy !== null && doc?.getElementById(labelledBy) !== null && doc?.getElementById(labelledBy)?.textContent?.trim() !== '');
      if (!hasText) problems.push({ element: id || el.name, problem: 'checkbox/radio has no accessible name' });
      return;
    }
    const labelFor = id !== '' ? doc?.querySelector(`label[for="${id}"]`) : null;
    const ariaLabel = el.getAttribute('aria-label');
    const labelledBy = el.getAttribute('aria-labelledby');
    const labelledByText = labelledBy !== null ? doc?.getElementById(labelledBy)?.textContent?.trim() : undefined;
    const ok =
      (labelFor !== null && labelFor.textContent !== null && labelFor.textContent.trim() !== '') ||
      (ariaLabel !== null && ariaLabel.trim() !== '') ||
      (labelledByText !== undefined && labelledByText !== '');
    if (!ok) problems.push({ element: id || el.name || el.tagName.toLowerCase(), problem: 'input has no programmatic label' });
  });

  // Duplicate ids break `label[for]` and `aria-describedby` resolution in exactly the way that is
  // invisible to the author: the first match wins and the other field silently shares its wiring.
  const seen = new Set<string>();
  root.querySelectorAll('[id]').forEach((node) => {
    const id = node.id;
    if (seen.has(id)) problems.push({ element: id, problem: 'duplicate id in the same form' });
    seen.add(id);
  });

  return problems;
}
