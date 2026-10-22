/**
 * Typed failures for the capture pipeline.
 *
 * Two reasons this file exists as a registry rather than as scattered `throw new Error(...)`:
 *
 * 1. The person standing at the turntable has to be told what to do next. A stack trace is not an
 *    instruction, so every code carries an operator-facing sentence built from the actual numbers.
 * 2. CI branches on the exit code. The codes are stable, distinct per failure class, and never 0 —
 *    the honesty rule of this pipeline is that a step that could not run says so by exiting
 *    non-zero, so a code collapsing onto another code would let a lie through the gate.
 */

import type { CaptureJobState, ClaimScope } from '@nastech/api-contracts';

export type CaptureErrorCode =
  | 'usage'
  | 'input_invalid'
  | 'illegal_transition'
  | 'native_tool_missing'
  | 'geometry_not_produced'
  | 'metric_out_of_window'
  | 'metric_reference_unstable'
  | 'qc_gate_failed'
  | 'scope_exceeds_evidence'
  | 'budget_exceeded'
  | 'rendition_size_missing'
  | 'bucket_unavailable'
  | 'checksum_mismatch'
  | 'custody_chain_broken'
  | 'capture_not_viable';

/**
 * Exit codes. 0 is reserved for "the step actually happened". Kept in one table so a new failure
 * class cannot quietly reuse a code an operator already reads as a specific instruction.
 */
export const EXIT_CODES: Readonly<Record<CaptureErrorCode, number>> = {
  usage: 2,
  input_invalid: 2,
  illegal_transition: 3,
  native_tool_missing: 4,
  geometry_not_produced: 4,
  metric_out_of_window: 5,
  metric_reference_unstable: 5,
  qc_gate_failed: 6,
  scope_exceeds_evidence: 6,
  budget_exceeded: 7,
  rendition_size_missing: 7,
  bucket_unavailable: 8,
  checksum_mismatch: 8,
  custody_chain_broken: 9,
  capture_not_viable: 10,
};

/** Short machine-readable summary for `--json`. */
export const FAILURE_SUMMARIES: Readonly<Record<CaptureErrorCode, string>> = {
  usage: 'Command line could not be interpreted.',
  input_invalid: 'A required input was missing or malformed.',
  illegal_transition: 'Capture job asked to move to a state the machine forbids.',
  native_tool_missing: 'A native geometry tool is required and is not installed.',
  geometry_not_produced: 'A native tool reported success without writing bytes.',
  metric_out_of_window: 'Solved object size falls outside the pilot category sanity window.',
  metric_reference_unstable: 'Reference measurements disagree beyond tolerance.',
  qc_gate_failed: 'At least one measurable QC gate failed.',
  scope_exceeds_evidence: 'Requested claim scope is broader than the QC evidence supports.',
  budget_exceeded: 'Produced bytes exceed a declared payload ceiling.',
  rendition_size_missing: 'A rendition has no honest byte count.',
  bucket_unavailable: 'No bucket transport or credentials in this environment.',
  checksum_mismatch: 'Uploaded bytes do not hash to the manifest digest.',
  custody_chain_broken: 'The append-only custody history does not verify.',
  capture_not_viable: 'Item cannot recover the cost of its own capture.',
};

export type FailureContext = Readonly<Record<string, unknown>>;

/**
 * Every pipeline refusal. `operatorSentence` is what the CLI prints; `hint` is the next action,
 * because a refusal without a next step turns into an operator guessing at the machine.
 */
export class CaptureError extends Error {
  readonly code: CaptureErrorCode;
  readonly exitCode: number;
  readonly operatorSentence: string;
  readonly hint: string;
  readonly context: FailureContext;

  constructor(
    code: CaptureErrorCode,
    operatorSentence: string,
    hint: string,
    context: FailureContext = {},
  ) {
    super(operatorSentence);
    this.name = 'CaptureError';
    this.code = code;
    this.exitCode = EXIT_CODES[code];
    this.operatorSentence = operatorSentence;
    this.hint = hint;
    this.context = context;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      exitCode: this.exitCode,
      summary: FAILURE_SUMMARIES[this.code],
      operator: this.operatorSentence,
      hint: this.hint,
      context: this.context,
    };
  }
}

/** Anything that is not a `CaptureError` still has to exit non-zero with a sentence, not a dump. */
export function toCaptureError(cause: unknown): CaptureError {
  if (cause instanceof CaptureError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  return new CaptureError(
    'input_invalid',
    `Unexpected failure: ${message}`,
    'Re-run with --json and report the code if it repeats.',
    { cause: message },
  );
}

/** ZAR with a thousands separator, so an operator reads R2,700.00 and not 2700. */
export function formatRand(cents: number): string {
  return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const mm = (n: number) => `${n.toFixed(1)} mm`;

export function usageError(message: string, hint = 'Run `nastech-capture --help`.'): CaptureError {
  return new CaptureError('usage', message, hint, { message });
}

export function inputInvalid(message: string, hint: string, context: FailureContext = {}): CaptureError {
  return new CaptureError('input_invalid', message, hint, context);
}

export function illegalTransition(from: CaptureJobState, to: CaptureJobState, why: string): CaptureError {
  return new CaptureError(
    'illegal_transition',
    `A job in "${from}" cannot move to "${to}". ${why}`,
    from === 'published' || from === 'failed'
      ? 'Start a new capture job; a finished job is never reopened, because the custody trail of a closed job is evidence.'
      : 'Run `nastech-capture status --job <id>` to see where the job actually is.',
    { from, to, why },
  );
}

export function nativeToolMissing(tool: string, forWhat: string): CaptureError {
  return new CaptureError(
    'native_tool_missing',
    `${tool} is not installed, so ${forWhat} — nothing was produced.`,
    `Install ${tool} on the studio machine, then re-run. The command plan printed above is exactly what would have run.`,
    { tool, forWhat },
  );
}

export function geometryNotProduced(renditionId: string, command: string): CaptureError {
  return new CaptureError(
    'geometry_not_produced',
    `${renditionId}: the tool exited without an error but wrote no bytes.`,
    `This is a tool bug, not a data problem. Re-run by hand and inspect: ${command}`,
    { renditionId, command },
  );
}

export function metricOutOfWindow(caseMeters: number, minMm: number, maxMm: number): CaptureError {
  const caseMm = caseMeters * 1000;
  return new CaptureError(
    'metric_out_of_window',
    `Solved case size is ${mm(caseMm)}; a pre-owned watch case must measure between ${mm(minMm)} and ${mm(maxMm)}.`,
    'Re-measure the reference card in frame. If the item really is this size it is not the pilot category — do not capture it.',
    { caseMm, minMm, maxMm },
  );
}

export function metricReferenceUnstable(spreadRatio: number, tolerance: number): CaptureError {
  return new CaptureError(
    'metric_reference_unstable',
    `Reference measurements disagree by ${(spreadRatio * 100).toFixed(2)} % (tolerance ${(tolerance * 100).toFixed(1)} %).`,
    'The reference moved between frames, or it was occluded. Re-shoot with the card flat and unobstructed.',
    { spreadRatio, tolerance },
  );
}

export interface QcGateFailureBrief {
  readonly label: string;
  readonly measured: string;
  readonly required: string;
}

export function qcGateFailed(failures: readonly QcGateFailureBrief[], next: string): CaptureError {
  const detail = failures.map((f) => `${f.label} ${f.measured} (needs ${f.required})`).join('; ');
  return new CaptureError(
    'qc_gate_failed',
    `Auto-QC refused the session: ${detail}.`,
    next,
    { failures },
  );
}

export function scopeExceedsEvidence(requested: ClaimScope, supported: ClaimScope): CaptureError {
  return new CaptureError(
    'scope_exceeds_evidence',
    `Asked to claim "${requested}", but the QC evidence only supports "${supported}".`,
    'A render is not evidence. Either re-shoot so the missing gate passes, or publish at the narrower scope and let the text carry the claim.',
    { requested, supported },
  );
}

export function budgetExceeded(
  what: string,
  measuredBytes: number,
  limitBytes: number,
  budgetName: string,
): CaptureError {
  return new CaptureError(
    'budget_exceeded',
    `${what} is ${measuredBytes.toLocaleString('en-ZA')} bytes; the declared ceiling for ${budgetName} is ${limitBytes.toLocaleString('en-ZA')}.`,
    'Re-run LOD generation with a stronger decimation target, or drop a tier. Publishing this would break the byte guard on a 2 GB phone.',
    { what, measuredBytes, limitBytes, budgetName },
  );
}

export function renditionSizeMissing(renditionId: string, why: string): CaptureError {
  return new CaptureError(
    'rendition_size_missing',
    `Rendition ${renditionId} has no honest byte count (${why}).`,
    'The client refuses before fetching based on this field. A manifest with a missing size is worse than no manifest.',
    { renditionId, why },
  );
}

export function bucketUnavailable(missing: readonly string[]): CaptureError {
  return new CaptureError(
    'bucket_unavailable',
    `No private-bucket transport is available here (missing: ${missing.join(', ')}). Nothing was uploaded.`,
    'Set the NASTECH_MEDIA_BUCKET_* credentials and install a bucket client, or run `publish --check-only` to validate the manifest without moving bytes.',
    { missing },
  );
}

export function checksumMismatch(renditionId: string, expected: string, actual: string): CaptureError {
  return new CaptureError(
    'checksum_mismatch',
    `${renditionId} hashed to ${actual} after upload but the manifest declares ${expected}.`,
    'Do not publish a rendition whose bytes do not match the manifest — the signed URL would serve something the QC gate never saw.',
    { renditionId, expected, actual },
  );
}

export function custodyChainBroken(sequence: number, reason: string): CaptureError {
  return new CaptureError(
    'custody_chain_broken',
    `Custody history does not verify at entry ${sequence}: ${reason}`,
    'Treat the item as unverified custody until a supervisor reconciles it. This is the record a dispute reads.',
    { sequence, reason },
  );
}

export function captureNotViable(
  priceCents: number,
  breakEvenCents: number,
  captureCostCents: number,
  takeRate: number,
): CaptureError {
  return new CaptureError(
    'capture_not_viable',
    `This item lists at ${formatRand(priceCents)}. Capture costs ${formatRand(captureCostCents)} against a ${Math.round(takeRate * 100)} % commission, so it must clear ${formatRand(breakEvenCents)} for the capture to pay for itself.`,
    'The static path (poster + turntable + written condition) is sufficient for items below the line — list it that way rather than spending the capture budget.',
    { priceCents, breakEvenCents, captureCostCents, takeRate },
  );
}
