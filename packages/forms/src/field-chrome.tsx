/**
 * The three DOM slots a field needs: label, hint, message.
 *
 * Split out because the a11y contract is about *these* elements: `<label for>` must exist, the
 * message node must be referenced by `aria-describedby`, and the message must be inside a live
 * region so a failure that appears while the user is on the field is announced anyway. A feature
 * agent who writes their own `<div>{error}</div>` gets all three wrong in a way no screenshot shows.
 *
 * `renderMessage` is a required prop, not a fallback string. This package returns codes; the words
 * come from `@nastech/i18n`. A default "This field is required" here would be an English sentence in
 * a package whose whole point is that validation and rendering are separate.
 */

import type { ReactNode } from 'react';

import type { FormIssue } from './types.js';
import type { AriaAttrs } from './a11y.js';

export type RenderMessage = (issue: FormIssue) => string;

export function FieldLabel(props: {
  readonly attrs: AriaAttrs;
  readonly required?: boolean | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const { attrs, required, children } = props;
  return (
    <label
      id={attrs.id as string | undefined}
      htmlFor={attrs.htmlFor as string | undefined}
      data-required={required === true ? 'true' : undefined}
    >
      {children}
      {/* Not a red asterisk alone: colour-only required markers fail WCAG 1.4.1. */}
      {required === true ? <span aria-hidden="true"> *</span> : null}
      {required === true ? <span className="sr-only"> (required)</span> : null}
    </label>
  );
}

export function FieldHint(props: { readonly id: string; readonly children: ReactNode }): ReactNode {
  return <p id={props.id}>{props.children}</p>;
}

export function FieldMessage(props: {
  readonly attrs: AriaAttrs;
  readonly issue?: FormIssue | undefined;
  readonly renderMessage: RenderMessage;
  readonly kind: 'error' | 'warning';
}): ReactNode {
  const { attrs, issue, renderMessage, kind } = props;
  const hidden = issue === undefined;
  return (
    <p
      id={attrs.id as string | undefined}
      role={attrs.role as 'status' | undefined}
      aria-live={attrs['aria-live'] as 'polite' | 'assertive' | undefined}
      aria-atomic={attrs['aria-atomic'] as boolean | undefined}
      data-kind={kind}
      {...(hidden ? { 'aria-hidden': 'true' as const } : {})}
      style={hidden ? { display: 'none' } : undefined}
    >
      {hidden ? '' : renderMessage(issue)}
    </p>
  );
}

/**
 * Live region for whole-form messages ("sign in again", "3 fields need attention"). One per form,
 * referenced by `useForm().statusRegion`.
 */
export function FormStatusRegion(props: {
  readonly region: { readonly id: string; readonly role: 'status' | 'alert'; readonly 'aria-live': 'polite' | 'assertive'; readonly 'aria-atomic': true };
  readonly issue?: FormIssue | undefined;
  readonly renderMessage: RenderMessage;
}): ReactNode {
  const { region, issue, renderMessage } = props;
  return (
    <div
      id={region.id}
      role={region.role}
      aria-live={region['aria-live']}
      aria-atomic={region['aria-atomic']}
      data-has-message={issue === undefined ? 'false' : 'true'}
    >
      {issue === undefined ? '' : renderMessage(issue)}
    </div>
  );
}
