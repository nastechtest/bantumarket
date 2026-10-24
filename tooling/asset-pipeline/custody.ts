/**
 * Chain of custody.
 *
 * A pre-owned watch is high-value and trivially swapped, so "the watch in the studio is the watch
 * listed" has to be reconstructible after the fact. Two properties make that checkable rather than
 * merely hoped for:
 *
 * - **append-only**: the API exposes no update, delete, truncate or reorder. `records()` hands back
 *   frozen copies, so mutating a read is a silent no-op in sloppy callers and a thrown TypeError in
 *   strict mode — never a rewritten history.
 * - **hash-chained**: every entry folds the previous entry's digest into its own. Deleting or
 *   editing one row breaks every digest after it, so `verify()` catches a history that was edited
 *   with a text editor — which is exactly how a custody log gets tampered with.
 *
 * A transition that the state machine forbids cannot be written here at all: the log is the record
 * of the machine, not a diary.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { CaptureJobState } from '@nastech/api-contracts';
import { canTransition, isKnownState } from './job-state.js';
import { custodyChainBroken, inputInvalid } from './errors.js';

export const GENESIS_HASH = '0'.repeat(64);

/** Entries that assert a judgement, so an entry with no evidence behind it is worthless. */
const EVIDENCE_REQUIRED_TO: readonly CaptureJobState[] = ['qc_auto', 'qc_human', 'published', 'failed', 'reshot'];

export interface CustodyRecord {
  readonly sequence: number;
  readonly jobId: string;
  /** null only for the genesis entry that opens a job at intake. */
  readonly from: CaptureJobState | null;
  readonly to: CaptureJobState;
  readonly actor: string;
  readonly at: string;
  readonly evidence: string | null;
  readonly prevHash: string;
  readonly hash: string;
}

export interface CustodyEntryInput {
  readonly jobId: string;
  readonly from: CaptureJobState | null;
  readonly to: CaptureJobState;
  readonly actor: string;
  readonly at: string;
  readonly evidence: string | null;
}

export type ChainVerdict = { ok: true; entries: number } | { ok: false; sequence: number; reason: string };

/**
 * Key order is spelled out because the digest is only reproducible if serialisation is: `JSON.
 * stringify` follows insertion order, and a refactor that reorders the interface would otherwise
 * quietly invalidate every history on disk.
 */
function canonicalRow(row: Omit<CustodyRecord, 'hash'>): string {
  return [
    row.sequence,
    row.jobId,
    row.from ?? '',
    row.to,
    row.actor,
    row.at,
    row.evidence ?? '',
    row.prevHash,
  ].join('\u001f');
}

export function digestRow(row: Omit<CustodyRecord, 'hash'>): string {
  return createHash('sha256').update(canonicalRow(row), 'utf8').digest('hex');
}

export class CustodyLog {
  readonly #rows: CustodyRecord[] = [];
  readonly #lastByJob = new Map<string, CaptureJobState>();
  readonly #persist: ((row: CustodyRecord) => void) | null;

  constructor(persist: ((row: CustodyRecord) => void) | null = null) {
    this.#persist = persist;
  }

  /**
   * Replay an existing JSONL file. Every row is re-digested and re-chained here, so a file that was
   * edited on disk fails to open rather than failing later at publish time.
   */
  static fromRows(rows: readonly CustodyRecord[], persist?: (row: CustodyRecord) => void): CustodyLog {
    const log = new CustodyLog(persist ?? null);
    let prevHash = GENESIS_HASH;
    let previousInstant: number | null = null;
    rows.forEach((row, index) => {
      if (row.sequence !== index + 1) {
        throw custodyChainBroken(row.sequence, `sequence is out of order (expected ${index + 1})`);
      }
      if (row.prevHash !== prevHash) {
        throw custodyChainBroken(row.sequence, 'the row links to a digest that is not the previous row');
      }
      if (previousInstant !== null && Date.parse(row.at) < previousInstant) {
        throw custodyChainBroken(row.sequence, 'timestamp runs backwards against the previous entry');
      }
      const { hash, ...rest } = row;
      const recomputed = digestRow(rest);
      if (hash !== recomputed) {
        throw custodyChainBroken(row.sequence, `row digest is ${hash.slice(0, 12)}…, re-digesting gives ${recomputed.slice(0, 12)}…`);
      }
      // A digest proves the row was not edited, not that the move it records ever happened in
      // that order. Replaying the state machine here is what catches a file whose rows were
      // removed from another job or stitched together from two attempts.
      const last = log.#lastByJob.get(row.jobId);
      if (last === undefined) {
        if (row.from !== null || row.to !== 'intake') {
          throw custodyChainBroken(row.sequence, `job ${row.jobId} has no history, so its first entry must open it at intake`);
        }
      } else {
        if (row.from !== last) {
          throw custodyChainBroken(row.sequence, `job ${row.jobId} is in "${last}", but the entry moves from "${row.from ?? 'nothing'}"`);
        }
        const verdict = canTransition(last, row.to);
        if (!verdict.ok) throw custodyChainBroken(row.sequence, `job ${row.jobId}: ${verdict.reason}`);
      }
      log.#rows.push(Object.freeze({ ...row }));
      log.#lastByJob.set(row.jobId, row.to);
      prevHash = row.hash;
      previousInstant = Date.parse(row.at);
    });
    return log;
  }

  get length(): number {
    return this.#rows.length;
  }

  lastState(jobId: string): CaptureJobState | null {
    return this.#lastByJob.get(jobId) ?? null;
  }

  /** Frozen rows, in write order, optionally filtered to one job. */
  records(jobId?: string): readonly CustodyRecord[] {
    const matched = jobId === undefined ? this.#rows : this.#rows.filter((r) => r.jobId === jobId);
    return Object.freeze(matched.map((r) => Object.freeze({ ...r })));
  }

  append(input: CustodyEntryInput): CustodyRecord {
    const jobId = input.jobId.trim();
    const actor = input.actor.trim();
    if (!jobId) throw inputInvalid('Custody entry needs a job id.', 'Every custody row is keyed by job.');
    if (!isKnownState(input.to)) throw inputInvalid(`"${input.to}" is not a capture job state.`, 'Use one of the states the client and the DDL both know.');
    if (!actor) throw inputInvalid('Custody entry needs the actor who did it.', 'Chain of custody without a name is not chain of custody.');
    if (!Number.isFinite(Date.parse(input.at))) throw inputInvalid(`"${input.at}" is not a timestamp.`, 'Pass an ISO-8601 instant.');

    const last = this.#lastByJob.get(jobId);
    if (last === undefined) {
      if (input.from !== null || input.to !== 'intake') {
        throw inputInvalid(
          `Job ${jobId} has no history, so its first entry must open it at intake.`,
          'Run intake first — the receipt and the custody start are issued by the same step.',
        );
      }
    } else {
      if (input.from !== last) {
        throw inputInvalid(
          `Job ${jobId} is in "${last}"; the entry claims it moved from "${input.from ?? 'nothing'}".`,
          'A custody row cannot describe a move from a state the job was never in.',
        );
      }
      const verdict = canTransition(last, input.to);
      if (!verdict.ok) {
        throw inputInvalid(`Illegal custody entry: ${verdict.reason}`, 'Fix the job, not the history.', { jobId, last, to: input.to });
      }
    }

    if (EVIDENCE_REQUIRED_TO.includes(input.to) && !(input.evidence ?? '').trim()) {
      throw inputInvalid(
        `Moving job ${jobId} to "${input.to}" requires the evidence reference behind that judgement.`,
        'Name the measurement file, session directory or decision text — a judgement with nothing behind it is not reviewable.',
      );
    }

    const prevHash = this.#rows.length === 0 ? GENESIS_HASH : this.#rows[this.#rows.length - 1]!.hash;
    const previous = this.#rows[this.#rows.length - 1];
    if (previous && Date.parse(input.at) < Date.parse(previous.at)) {
      throw inputInvalid(
        `Custody time cannot run backwards (last entry ${previous.at}, this one ${input.at}).`,
        'Fix the studio clock; do not backdate a custody row.',
      );
    }

    const draft: Omit<CustodyRecord, 'hash'> = {
      sequence: this.#rows.length + 1,
      jobId,
      from: input.from,
      to: input.to,
      actor,
      at: input.at,
      evidence: input.evidence,
      prevHash,
    };
    const record = Object.freeze({ ...draft, hash: digestRow(draft) });

    this.#rows.push(record);
    this.#lastByJob.set(jobId, input.to);
    this.#persist?.(record);
    return record;
  }

  verify(): ChainVerdict {
    let prevHash = GENESIS_HASH;
    let previousInstant: number | null = null;
    for (const row of this.#rows) {
      if (row.prevHash !== prevHash) return { ok: false, sequence: row.sequence, reason: 'row links to a digest that is not the previous row' };
      const { hash, ...rest } = row;
      const recomputed = digestRow(rest);
      if (recomputed !== hash) return { ok: false, sequence: row.sequence, reason: 'row contents do not match their own digest' };
      if (previousInstant !== null && Date.parse(row.at) < previousInstant) {
        return { ok: false, sequence: row.sequence, reason: 'timestamp runs backwards' };
      }
      prevHash = row.hash;
      previousInstant = Date.parse(row.at);
    }
    return { ok: true, entries: this.#rows.length };
  }

  verifyOrThrow(): void {
    const verdict = this.verify();
    if (!verdict.ok) throw custodyChainBroken(verdict.sequence, verdict.reason);
  }
}

function serializeRow(row: CustodyRecord): string {
  return JSON.stringify({
    sequence: row.sequence,
    job_id: row.jobId,
    from_state: row.from,
    to_state: row.to,
    actor: row.actor,
    at: row.at,
    evidence: row.evidence,
    prev_hash: row.prevHash,
    hash: row.hash,
  });
}

function parseLine(line: string, lineNumber: number): CustodyRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw custodyChainBroken(lineNumber, `line ${lineNumber} is not JSON — the file was edited outside the pipeline`);
  }
  if (typeof raw !== 'object' || raw === null) throw custodyChainBroken(lineNumber, `line ${lineNumber} is not an object`);
  const o = raw as Record<string, unknown>;
  const state = (v: unknown): CaptureJobState | null => {
    if (v === null) return null;
    if (typeof v === 'string' && isKnownState(v)) return v;
    throw custodyChainBroken(lineNumber, `state ${JSON.stringify(v)} is not a known capture job state`);
  };
  const text = (v: unknown): string => {
    if (typeof v !== 'string') throw custodyChainBroken(lineNumber, 'a required string field is missing');
    return v;
  };
  if (typeof o.sequence !== 'number') throw custodyChainBroken(lineNumber, 'sequence is missing');
  const to = state(o.to_state);
  if (to === null) throw custodyChainBroken(lineNumber, 'to_state is missing');
  return {
    sequence: o.sequence,
    jobId: text(o.job_id),
    from: state(o.from_state),
    to,
    actor: text(o.actor),
    at: text(o.at),
    evidence: o.evidence === null ? null : text(o.evidence),
    prevHash: text(o.prev_hash),
    hash: text(o.hash),
  };
}

/**
 * Open (or create) the JSONL custody file. Reading a file that does not verify throws — a broken
 * history must stop the pipeline rather than be quietly continued from.
 */
export function openCustodyLog(path: string): CustodyLog {
  if (!existsSync(path)) return new CustodyLog((row) => appendFileSync(path, `${serializeRow(row)}\n`, 'utf8'));
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const rows = lines.map((line, i) => parseLine(line, i + 1));
  const log = CustodyLog.fromRows(rows, (row) => appendFileSync(path, `${serializeRow(row)}\n`, 'utf8'));
  log.verifyOrThrow();
  return log;
}
