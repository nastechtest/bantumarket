/**
 * What a buyer may attach, and what it takes to say so kindly.
 *
 * These ceilings are ours, not the service's: `// CONTRACT-GAP:` the PHP Media/Capture side already
 * issues upload slots with its own byte ceiling and the dispute module must return the smaller of
 * the two, otherwise a buyer passes a client check and then fails a server one — which reads to them
 * as the platform losing their photo.
 *
 * The rule underneath every limit here: a limit may narrow what a buyer can attach, never whether
 * they can raise a dispute. `DEGRADE_COPY` is the exit that keeps that true — the written statement
 * is always available, because the dispute process reads text and a rejected JPEG must not become a
 * rejected complaint.
 */

/** Photo of the caseback, video of the crown, PDF of the receipt. Nothing else: an .exe is not evidence. */
export const ACCEPTED_EVIDENCE_MIMES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
];

export const EVIDENCE_LIMITS = {
  maxFilesPerDispute: 8,
  maxBytesPerFile: 8 * 1024 * 1024,
  maxTotalBytes: 24 * 1024 * 1024,
  acceptedMimes: ACCEPTED_EVIDENCE_MIMES,
} as const;

export const STATEMENT_LIMITS = {
  /** Below this the dispute is unreadable by a reviewer: "it's broken" cannot be compared against a
   *  listing. Three short sentences, not an essay. */
  minChars: 40,
  maxChars: 4000,
} as const;

export const DRAFT_NOTICE =
  'Your unfinished dispute is kept on this device only. It is not sent to NasTech, not visible to the seller, and is cleared the moment you send the dispute or discard it here.';

export const DEGRADE_COPY = {
  heading: 'No photo needed',
  body:
    'If a file will not upload, or the phone camera will not give you one you are happy with, write what you can see instead. A reviewer reads your words, and your dispute is not weaker for having none of the pictures.',
} as const;

export type EvidenceRejectionCode =
  | 'too_many_files'
  | 'file_too_large'
  | 'total_too_large'
  | 'unsupported_type'
  | 'empty_file'
  | 'duplicate_file';

export interface EvidenceCandidate {
  readonly filename: string;
  readonly mime: string;
  readonly bytes: number;
}

export interface EvidenceRejection {
  readonly code: EvidenceRejectionCode;
  readonly message: string;
  /** The way out that keeps the dispute alive. Always present: a rejection without an alternative
   *  is how an intake screen becomes a wall. */
  readonly alternative: string;
}

const MIB = 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < MIB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MIB).toFixed(1)} MB`;
}

/**
 * Pure acceptance check over the already-attached set plus one candidate. Order matters: a file that
 * is both oversized and of a rejected type gets the type message, because the buyer can act on that
 * one without deleting anything.
 */
export function checkEvidenceAcceptance(
  existing: readonly EvidenceCandidate[],
  candidate: EvidenceCandidate,
): EvidenceRejection | null {
  if (candidate.bytes === 0) {
    return {
      code: 'empty_file',
      message: `“${candidate.filename}” is empty, so there is nothing for a reviewer to look at.`,
      alternative: DEGRADE_COPY.body,
    };
  }
  if (!EVIDENCE_LIMITS.acceptedMimes.includes(candidate.mime)) {
    return {
      code: 'unsupported_type',
      message: `We can’t accept a ${candidate.mime || 'file of unknown type'}. Accepted: ${EVIDENCE_LIMITS.acceptedMimes.join(', ')}.`,
      alternative: 'Take another photo or a screenshot of the file you have, and try that instead.',
    };
  }
  if (candidate.bytes > EVIDENCE_LIMITS.maxBytesPerFile) {
    return {
      code: 'file_too_large',
      message: `“${candidate.filename}” is ${formatBytes(candidate.bytes)}; one file can be at most ${formatBytes(EVIDENCE_LIMITS.maxBytesPerFile)}.`,
      alternative: 'Send a smaller photo of the same thing, or describe it in your statement.',
    };
  }
  if (existing.length >= EVIDENCE_LIMITS.maxFilesPerDispute) {
    return {
      code: 'too_many_files',
      message: `${EVIDENCE_LIMITS.maxFilesPerDispute} files is the most a case file holds. Remove one you no longer need, or attach this to a later response.`,
      alternative: DEGRADE_COPY.body,
    };
  }
  const total = existing.reduce((sum, e) => sum + e.bytes, 0) + candidate.bytes;
  if (total > EVIDENCE_LIMITS.maxTotalBytes) {
    return {
      code: 'total_too_large',
      message: `These files together would be ${formatBytes(total)}; the case file holds ${formatBytes(EVIDENCE_LIMITS.maxTotalBytes)}.`,
      alternative: 'Remove a video and keep the still that shows the fault.',
    };
  }
  if (existing.some((e) => e.filename === candidate.filename && e.bytes === candidate.bytes)) {
    return {
      code: 'duplicate_file',
      message: `“${candidate.filename}” is already attached.`,
      alternative: 'No need to send it twice.',
    };
  }
  return null;
}

export type StatementProblem = 'too_short' | 'too_long' | null;

export function statementProblem(text: string): StatementProblem {
  const length = text.trim().length;
  if (length < STATEMENT_LIMITS.minChars) return 'too_short';
  if (length > STATEMENT_LIMITS.maxChars) return 'too_long';
  return null;
}

/** Copy for the statement field. `too_short` counts up rather than scolding: the gap is usually one
 *  sentence, and telling someone they wrote 12 of 40 characters is actionable. */
export function statementProblemMessage(problem: Exclude<StatementProblem, null>, length: number): string {
  if (problem === 'too_long') {
    return `That is ${length} characters; a dispute statement can be ${STATEMENT_LIMITS.maxChars}. Keep the part a reviewer can compare against the listing.`;
  }
  return `Write about the item, not just the problem — ${STATEMENT_LIMITS.minChars - length} more characters and this is readable by someone who has never seen your watch.`;
}

/** Remaining capacity, for the evidence list header. Never negative. */
export function remainingFileSlots(existingCount: number): number {
  return Math.max(0, EVIDENCE_LIMITS.maxFilesPerDispute - existingCount);
}
