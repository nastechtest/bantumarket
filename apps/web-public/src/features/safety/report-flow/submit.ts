import type { ReportAck, ReportInput, ReportSubject, SafetyTransport } from '../api/safety-transport.js';
import { REPORT_QUEUE } from '../api/safety-transport.js';
import type { ReportEvidence } from '../api/safety-transport.js';

/**
 * The single validation + submit path. The UI cannot submit an invalid draft, and the rules live
 * here rather than in components so the receipt screen and the tests see the same truth.
 */

export interface ReportDraft {
  readonly subject: ReportSubject | null;
  readonly reasonId: string | null;
  readonly narrative: string;
  readonly evidence: readonly ReportEvidence[];
  readonly contact: string;
  readonly signedIn: boolean;
  readonly ackReadQueue: boolean;
  readonly ackSubjectSees: boolean;
}

export const emptyDraft: ReportDraft = {
  subject: null,
  reasonId: null,
  narrative: '',
  evidence: [],
  contact: '',
  signedIn: false,
  ackReadQueue: false,
  ackSubjectSees: false,
};

export const MIN_NARRATIVE_CHARS = 40;

const CONTACT_SHAPE = /^(\S+@\S+\.\S+|[0+][0-9 ()-]{9,15})$/;

/** Step ids in flow order; the wizard and tests both key off this list. */
export const REPORT_STEPS = ['subject', 'reason', 'evidence', 'next', 'receipt'] as const;
export type ReportStep = (typeof REPORT_STEPS)[number];

export function validateReport(draft: ReportDraft): readonly string[] {
  const errors: string[] = [];
  if (draft.subject === null) errors.push('Pick who or what you are reporting.');
  if (draft.reasonId === null) errors.push('Pick the reason that fits best — you can add detail below it.');
  if (draft.narrative.trim().length < MIN_NARRATIVE_CHARS) {
    errors.push(
      `Describe it in at least ${MIN_NARRATIVE_CHARS} characters. A human reads this; “scammer!” alone tells the queue nothing.`,
    );
  }
  if (!draft.signedIn && !CONTACT_SHAPE.test(draft.contact.trim())) {
    errors.push('Without an account, leave an email or phone number so the queue can ask you one question.');
  }
  if (!draft.ackReadQueue) errors.push('Confirm you understand the queue and the response target.');
  if (!draft.ackSubjectSees) errors.push('Confirm you understand the person reported sees your reason and attachments.');
  return errors;
}

export function draftToInput(draft: ReportDraft, submittedAt: string): ReportInput {
  if (draft.subject === null || draft.reasonId === null) {
    throw new TypeError('draftToInput called on an invalid draft — check validateReport first');
  }
  return {
    subject: draft.subject,
    reasonId: draft.reasonId,
    narrative: draft.narrative.trim(),
    evidence: draft.evidence,
    signedIn: draft.signedIn,
    submittedAt,
    ...(draft.signedIn
      ? {}
      : { contact: draft.contact.trim() }),
  };
}

export interface SubmitOutcome {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly ack?: ReportAck;
}

export async function submitReport(
  transport: SafetyTransport,
  draft: ReportDraft,
  submittedAt = new Date().toISOString(),
): Promise<SubmitOutcome> {
  const errors = validateReport(draft);
  if (errors.length > 0) return { ok: false, errors };
  const ack = await transport.submitReport(draftToInput(draft, submittedAt));
  return { ok: true, errors: [], ack };
}

/** Re-exported so the receipt text and the queue facts cannot drift apart. */
export { REPORT_QUEUE };
