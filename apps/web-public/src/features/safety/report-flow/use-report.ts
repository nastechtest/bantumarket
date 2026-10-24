import { useReducer } from 'react';
import type { ReportAck, SafetyTransport } from '../api/safety-transport.js';
import type { ReportDraft, ReportStep } from './submit.js';
import { REPORT_STEPS, emptyDraft, submitReport } from './submit.js';

/**
 * The wizard's state machine: draft, step, submission status. Kept in one reducer so "you cannot
 * go forward with an invalid step" and "a failed submit keeps everything you typed" are state
 * facts rather than component folklore.
 */

export type SubmitStatus = 'idle' | 'submitting' | 'submitted' | 'failed';

export interface ReportState {
  readonly draft: ReportDraft;
  readonly stepIndex: number;
  readonly status: SubmitStatus;
  readonly errors: readonly string[];
  readonly ack: ReportAck | null;
  readonly transportError: string | null;
}

export type ReportAction =
  | { type: 'patch'; patch: Partial<ReportDraft> }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'submitStart' }
  | { type: 'blocked'; errors: readonly string[] }
  | { type: 'submitOk'; ack: ReportAck }
  | { type: 'submitFail'; message: string }
  | { type: 'reset' };

export function currentStep(state: ReportState): ReportStep {
  const index = Math.min(state.stepIndex, REPORT_STEPS.length - 1);
  return REPORT_STEPS[index]!;
}

/**
 * Per-step blocking, deliberately narrower than validateReport: being unable to advance because
 * you have not *reached* the confirmation checkboxes yet would be maddening. Each step gates only
 * its own fields; evidence remains optional all the way through.
 */
export function stepErrors(draft: ReportDraft, step: ReportStep): readonly string[] {
  switch (step) {
    case 'subject':
      return draft.subject === null ? ['Pick who or what you are reporting.'] : [];
    case 'reason': {
      const errors: string[] = [];
      if (draft.reasonId === null) errors.push('Pick the reason that fits best.');
      if (draft.narrative.trim().length < 40) {
        errors.push('Describe it in at least 40 characters — a human reads this.');
      }
      return errors;
    }
    case 'evidence':
      return [];
    case 'next': {
      const errors: string[] = [];
      if (!draft.ackReadQueue) errors.push('Tick that you understand the queue and the response target.');
      if (!draft.ackSubjectSees) errors.push('Tick that you understand the person reported sees your reason.');
      if (!draft.signedIn && draft.contact.trim().length === 0) {
        errors.push('Without an account, leave an email or phone number.');
      }
      return errors;
    }
    case 'receipt':
      return [];
  }
}

export function initialReportState(
  signedIn: boolean,
  prefilledSubject: ReportDraft['subject'],
): ReportState {
  // A pre-filled subject still lands on the picker — selected, visible, changeable. Silently
  // skipping it is how the wrong account gets reported.
  return {
    draft: { ...emptyDraft, signedIn, subject: prefilledSubject },
    stepIndex: 0,
    status: 'idle',
    errors: [],
    ack: null,
    transportError: null,
  };
}

export function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'patch':
      return { ...state, draft: { ...state.draft, ...action.patch }, errors: [] };
    case 'next': {
      const step = currentStep(state);
      const errors = stepErrors(state.draft, step);
      if (errors.length > 0) return { ...state, errors };
      return { ...state, stepIndex: state.stepIndex + 1, errors: [] };
    }
    case 'back':
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1), errors: [] };
    case 'submitStart':
      return { ...state, status: 'submitting', errors: [], transportError: null };
    case 'blocked':
      return { ...state, errors: action.errors };
    case 'submitOk':
      return { ...state, status: 'submitted', ack: action.ack, stepIndex: REPORT_STEPS.indexOf('receipt') };
    case 'submitFail':
      // The draft survives: someone whose report bounced at 11pm must not retype it.
      return { ...state, status: 'failed', transportError: action.message };
    case 'reset':
      return initialReportState(state.draft.signedIn, null);
  }
}

export interface UseReportResult {
  readonly state: ReportState;
  readonly step: ReportStep;
  patch(patch: Partial<ReportDraft>): void;
  next(): void;
  back(): void;
  acknowledge(key: 'readQueue' | 'readSubjectSees', checked: boolean): void;
  submit(): Promise<void>;
  reset(): void;
}

export function useReport(transport: SafetyTransport, signedIn: boolean, prefilledSubject: ReportDraft['subject']): UseReportResult {
  const [state, dispatch] = useReducer(
    reportReducer,
    initialReportState(signedIn, prefilledSubject),
  );

  return {
    state,
    step: currentStep(state),
    patch: (patch) => dispatch({ type: 'patch', patch }),
    next: () => dispatch({ type: 'next' }),
    back: () => dispatch({ type: 'back' }),
    acknowledge: (key, checked) =>
      dispatch({
        type: 'patch',
        patch: key === 'readQueue' ? { ackReadQueue: checked } : { ackSubjectSees: checked },
      }),
    submit: async () => {
      // The gate runs before the button is allowed to look busy. A submit that is blocked by an
      // unticked acknowledgement still reached the transport layer as "sending" otherwise, and the
      // screen then said nothing at all about why it never sent — the exact dishonesty this flow is
      // here to avoid. `submitReport` keeps its own full validation as the belt-and-braces pass.
      const blocked = stepErrors(state.draft, 'next');
      if (blocked.length > 0) {
        dispatch({ type: 'blocked', errors: blocked });
        return;
      }
      dispatch({ type: 'submitStart' });
      try {
        const outcome = await submitReport(transport, state.draft);
        if (outcome.ok && outcome.ack) {
          dispatch({ type: 'submitOk', ack: outcome.ack });
        } else {
          // Full validation caught something the step gates allowed (belt and braces).
          dispatch({ type: 'submitFail', message: outcome.errors.join(' ') || 'submit blocked' });
        }
      } catch (err) {
        dispatch({ type: 'submitFail', message: err instanceof Error ? err.message : String(err) });
      }
    },
    reset: () => dispatch({ type: 'reset' }),
  };
}

export { REPORT_STEPS };
export type { ReportStep };
