/**
 * The station's offline queue.
 *
 * Capture does not depend on the network. A session is sealed on the rig, written to a durable
 * queue, and transferred when the link is up. The queue file is the station's memory across
 * restarts, and three properties are load-bearing:
 *
 * - **enqueue is idempotent per session.** A double-clicked button or a retried call must not create
 *   two transfers of the same frames.
 * - **a receipt is issued once per job.** `recordReceipt` returns the code already on file and
 *   refuses a different one. Re-printing a seller's receipt with a new code would make the paper and
 *   the custody log disagree, which is the one thing the receipt exists to prevent.
 * - **writes are atomic.** A power cut during a queue update must leave the previous file intact,
 *   not a half-written one that loses a day's captures.
 *
 * The queue stores digests and counts, never frame bytes: the frames stay in the station's session
 * directory until every digest has been acknowledged by the origin.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inputInvalid, stationProtocol, transferIncomplete } from '../errors.js';
import type { FrameManifest } from './frame-capture-manifest.js';

export type QueuedStatus = 'pending' | 'transferring' | 'complete' | 'failed';

export interface QueuedSession {
  readonly sessionId: string;
  readonly jobId: string;
  readonly stationId: string;
  readonly manifestDigest: string;
  readonly framesTotal: number;
  readonly framesAcked: readonly number[];
  readonly receiptCode: string;
  readonly enqueuedAt: string;
  readonly updatedAt: string;
  readonly attempts: number;
  readonly status: QueuedStatus;
  readonly failure: string | null;
}

export interface ReceiptRecord {
  readonly jobId: string;
  readonly code: string;
  readonly issuedAt: string;
}

interface QueueFile {
  readonly version: 1;
  readonly sessions: readonly QueuedSession[];
  readonly receipts: readonly ReceiptRecord[];
}

export interface EnqueueInput {
  readonly manifest: FrameManifest;
  readonly receiptCode: string;
  readonly now: Date;
}

export interface ReceiptResult {
  readonly receipt: ReceiptRecord;
  /** False when this exact code was already on file; a restart re-reads, it does not re-issue. */
  readonly created: boolean;
}

const EMPTY: QueueFile = { version: 1, sessions: [], receipts: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseQueue(text: string): QueueFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw inputInvalid('The offline queue file is not valid JSON.', 'Restore the last good queue file; do not rebuild it by hand from memory.');
  }
  if (!isRecord(raw) || raw['version'] !== 1 || !Array.isArray(raw['sessions']) || !Array.isArray(raw['receipts'])) {
    throw inputInvalid('The offline queue file has an unknown shape.', 'Restore the last good queue file written by this pipeline.');
  }
  return {
    version: 1,
    sessions: raw['sessions'] as QueuedSession[],
    receipts: raw['receipts'] as ReceiptRecord[],
  };
}

export class OfflineQueue {
  readonly #file: string;
  #data: QueueFile;

  private constructor(dir: string, data: QueueFile) {
    this.#file = join(dir, 'queue.json');
    this.#data = data;
  }

  static open(dir: string): OfflineQueue {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'queue.json');
    if (!existsSync(file)) return new OfflineQueue(dir, EMPTY);
    return new OfflineQueue(dir, parseQueue(readFileSync(file, 'utf8')));
  }

  /** Atomic replace: a crash leaves either the old file or the new one, never a torn write. */
  #persist(): void {
    const temp = `${this.#file}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.#data, null, 2)}\n`, 'utf8');
    renameSync(temp, this.#file);
  }

  #write(data: QueueFile): void {
    this.#data = data;
    this.#persist();
  }

  #replaceSession(next: QueuedSession): void {
    this.#write({
      ...this.#data,
      sessions: this.#data.sessions.map((session) => (session.sessionId === next.sessionId ? next : session)),
    });
  }

  sessions(): readonly QueuedSession[] {
    return Object.freeze([...this.#data.sessions].sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt)));
  }

  get(sessionId: string): QueuedSession | null {
    return this.#data.sessions.find((session) => session.sessionId === sessionId) ?? null;
  }

  receipts(): readonly ReceiptRecord[] {
    return Object.freeze([...this.#data.receipts]);
  }

  /**
   * Queue a sealed session. The same session twice is a no-op; the same session with different
   * frames is a refusal, because two manifests under one id means one of them is not what was shot.
   */
  enqueue(input: EnqueueInput): QueuedSession {
    const { manifest } = input;
    if (!input.receiptCode.trim()) throw inputInvalid('A queued session needs the receipt code it was taken in under.', 'The receipt is the seller’s half of custody; a session without one is unclaimed.');

    const existing = this.get(manifest.sessionId);
    if (existing) {
      if (existing.manifestDigest !== manifest.digest) {
        throw stationProtocol(
          'Offline queue',
          `session ${manifest.sessionId} is already queued with a different manifest digest`,
          'Start a new session id for a new seal; reusing an id would overwrite the evidence of the first.',
        );
      }
      if (existing.receiptCode !== input.receiptCode) {
        throw stationProtocol(
          'Offline queue',
          `session ${manifest.sessionId} was queued under receipt ${existing.receiptCode}, not ${input.receiptCode}`,
          'Find the receipt that was printed for this session; a session belongs to one hand-in.',
        );
      }
      return existing;
    }

    const receipt = this.#data.receipts.find((row) => row.jobId === manifest.jobId);
    if (receipt && receipt.code !== input.receiptCode) {
      throw stationProtocol(
        'Offline queue',
        `job ${manifest.jobId} already has receipt ${receipt.code}; refusing to issue ${input.receiptCode}`,
        'A re-shoot belongs to the same job and keeps the original receipt. Re-issue only after the first receipt is formally voided.',
      );
    }
    if (!receipt) {
      this.#data = {
        ...this.#data,
        receipts: [...this.#data.receipts, { jobId: manifest.jobId, code: input.receiptCode, issuedAt: input.now.toISOString() }],
      };
    }

    const session: QueuedSession = {
      sessionId: manifest.sessionId,
      jobId: manifest.jobId,
      stationId: manifest.stationId,
      manifestDigest: manifest.digest,
      framesTotal: manifest.frameCount,
      framesAcked: [],
      receiptCode: input.receiptCode,
      enqueuedAt: input.now.toISOString(),
      updatedAt: input.now.toISOString(),
      attempts: 0,
      status: 'pending',
      failure: null,
    };
    this.#write({ ...this.#data, sessions: [...this.#data.sessions, session] });
    return session;
  }

  /** Issue once. The second caller gets the first code back with `created: false`. */
  recordReceipt(jobId: string, code: string, now: Date): ReceiptResult {
    if (!jobId.trim() || !code.trim()) throw inputInvalid('A receipt needs a job id and a code.', 'Both halves identify which item was handed in.');
    const existing = this.#data.receipts.find((row) => row.jobId === jobId);
    if (existing) {
      if (existing.code !== code) {
        throw stationProtocol(
          'Receipt',
          `job ${jobId} already has receipt ${existing.code}; refusing to re-issue ${code}`,
          'Receipts are issued once. A restart must print the same code; a new code makes the paper and the custody row disagree.',
        );
      }
      return { receipt: existing, created: false };
    }
    const receipt: ReceiptRecord = { jobId, code, issuedAt: now.toISOString() };
    this.#write({ ...this.#data, receipts: [...this.#data.receipts, receipt] });
    return { receipt, created: true };
  }

  ack(sessionId: string, frameIndex: number, now: Date): QueuedSession {
    const session = this.get(sessionId);
    if (!session) throw inputInvalid(`No queued session ${sessionId}.`, 'Enqueue the sealed manifest before acknowledging frames.');
    if (!Number.isInteger(frameIndex) || frameIndex < 1 || frameIndex > session.framesTotal) {
      throw inputInvalid(`Frame ${frameIndex} is outside 1..${session.framesTotal} for session ${sessionId}.`, 'Acknowledge a frame the manifest contains.');
    }
    if (session.framesAcked.includes(frameIndex)) return session;
    const next: QueuedSession = {
      ...session,
      framesAcked: Object.freeze([...session.framesAcked, frameIndex].sort((a, b) => a - b)),
      status: session.status === 'failed' ? 'failed' : 'transferring',
      updatedAt: now.toISOString(),
    };
    this.#replaceSession(next);
    return next;
  }

  markAttempt(sessionId: string, now: Date): QueuedSession {
    const session = this.get(sessionId);
    if (!session) throw inputInvalid(`No queued session ${sessionId}.`, 'Enqueue the sealed manifest first.');
    const next: QueuedSession = { ...session, attempts: session.attempts + 1, updatedAt: now.toISOString() };
    this.#replaceSession(next);
    return next;
  }

  markFailed(sessionId: string, reason: string, now: Date): QueuedSession {
    const session = this.get(sessionId);
    if (!session) throw inputInvalid(`No queued session ${sessionId}.`, 'Enqueue the sealed manifest first.');
    if (!reason.trim()) throw inputInvalid('A failed transfer needs a reason.', 'The next operator needs to know what to retry.');
    const next: QueuedSession = { ...session, status: 'failed', failure: reason.trim(), updatedAt: now.toISOString() };
    this.#replaceSession(next);
    return next;
  }

  /** Complete only when every frame is acknowledged. A partial upload is still pending. */
  complete(sessionId: string, now: Date): QueuedSession {
    const session = this.get(sessionId);
    if (!session) throw inputInvalid(`No queued session ${sessionId}.`, 'Enqueue the sealed manifest first.');
    if (session.framesAcked.length !== session.framesTotal) {
      throw transferIncomplete(sessionId, session.framesTotal - session.framesAcked.length, session.framesTotal);
    }
    const next: QueuedSession = { ...session, status: 'complete', failure: null, updatedAt: now.toISOString() };
    this.#replaceSession(next);
    return next;
  }

  pending(): readonly QueuedSession[] {
    return Object.freeze(this.sessions().filter((session) => session.status === 'pending' || session.status === 'transferring'));
  }

  summary(): { readonly pending: number; readonly transferring: number; readonly complete: number; readonly failed: number; readonly receipts: number } {
    const count = (status: QueuedStatus): number => this.#data.sessions.filter((session) => session.status === status).length;
    return {
      pending: count('pending'),
      transferring: count('transferring'),
      complete: count('complete'),
      failed: count('failed'),
      receipts: this.#data.receipts.length,
    };
  }

  /** Serialised form, used by the station CLI and by a backup taken before a rig is reimaged. */
  snapshot(): string {
    return `${JSON.stringify(this.#data, null, 2)}\n`;
  }
}
