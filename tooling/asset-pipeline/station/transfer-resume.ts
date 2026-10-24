/**
 * Resumable frame transfer.
 *
 * The station is in a basement with a link that drops. The rule is that a dropped transfer is
 * resumable from what the origin acknowledged — not from what the station hoped it had sent. So the
 * origin sends one acknowledgement per frame, the acknowledgement carries the digest it computed,
 * and progress is derived from acknowledgements only. A station restart reloads the same state file
 * and asks for the frames the origin has not confirmed.
 *
 * Out-of-order acknowledgements are accepted and kept, because a 120-frame upload over a flaky link
 * does not finish in order. Completion, however, requires every frame — a contiguous prefix would
 * let a lost frame in the middle hide behind a finished-looking transfer.
 */

import { createHash } from 'node:crypto';
import { inputInvalid, transferIncomplete, stationProtocol } from '../errors.js';
import { canonicalJson } from './protocol.js';
import type { FrameManifest } from './frame-capture-manifest.js';

export interface TransferPart {
  readonly index: number;
  readonly filename: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface TransferAck {
  readonly filename: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly acknowledgedAt: string;
}

export interface TransferState {
  readonly sessionId: string;
  readonly manifestDigest: string;
  readonly totalParts: number;
  readonly totalBytes: number;
  readonly acknowledged: readonly number[];
  readonly updatedAt: string;
  readonly stateDigest: string;
}

export interface TransferProgress {
  readonly sessionId: string;
  readonly acknowledgedParts: number;
  readonly totalParts: number;
  readonly bytesAcknowledged: number;
  readonly totalBytes: number;
  readonly missing: readonly number[];
  readonly complete: boolean;
}

export function planFrameTransfer(manifest: FrameManifest): readonly TransferPart[] {
  return Object.freeze(
    manifest.frames.map((frame) => ({
      index: frame.index,
      filename: frame.filename,
      sha256: frame.sha256,
      bytes: frame.bytes,
    })),
  );
}

function digestState(core: Omit<TransferState, 'stateDigest'>): string {
  return createHash('sha256').update(canonicalJson(core), 'utf8').digest('hex');
}

export function startTransfer(manifest: FrameManifest, now: Date): TransferState {
  const core = {
    sessionId: manifest.sessionId,
    manifestDigest: manifest.digest,
    totalParts: manifest.frameCount,
    totalBytes: manifest.frames.reduce((sum, frame) => sum + frame.bytes, 0),
    acknowledged: [] as number[],
    updatedAt: now.toISOString(),
  };
  return Object.freeze({ ...core, acknowledged: Object.freeze([]), stateDigest: digestState(core) });
}

/**
 * Record one acknowledgement. The digest is checked against the manifest, so an origin that stored
 * a truncated or re-encoded frame cannot acknowledge it into the count.
 */
export function applyAck(state: TransferState, manifest: FrameManifest, ack: TransferAck, now: Date): TransferState {
  if (state.sessionId !== manifest.sessionId || state.manifestDigest !== manifest.digest) {
    throw stationProtocol(
      'Transfer',
      `state belongs to session ${state.sessionId}, manifest is ${manifest.sessionId}`,
      'Do not merge transfer state across sessions; start a new transfer from the sealed manifest.',
    );
  }
  const part = manifest.frames.find((frame) => frame.filename === ack.filename);
  if (!part) {
    throw stationProtocol('Transfer', `acknowledgement names "${ack.filename}", which is not in the sealed manifest`, 'Refuse unknown frames: they are either the wrong session or an injected file.');
  }
  if (ack.sha256 !== part.sha256 || ack.bytes !== part.bytes) {
    throw stationProtocol(
      'Transfer',
      `frame ${ack.filename} arrived as ${ack.bytes} bytes ${ack.sha256.slice(0, 12)}…, manifest says ${part.bytes} bytes ${part.sha256.slice(0, 12)}…`,
      'Re-send the frame from the station copy. Do not acknowledge a changed frame into a sealed session.',
      { filename: ack.filename },
    );
  }
  if (!Number.isFinite(Date.parse(ack.acknowledgedAt))) {
    throw inputInvalid(`acknowledgedAt ${ack.acknowledgedAt} is not an instant.`, 'An acknowledgement is a dated event.');
  }
  if (state.acknowledged.includes(part.index)) return state;
  const acknowledged = [...state.acknowledged, part.index].sort((a, b) => a - b);
  const { stateDigest: _previous, ...rest } = state;
  const core = { ...rest, acknowledged, updatedAt: now.toISOString() };
  return Object.freeze({ ...core, acknowledged: Object.freeze(acknowledged), stateDigest: digestState(core) });
}

export function transferProgress(state: TransferState, manifest: FrameManifest): TransferProgress {
  const acked = new Set(state.acknowledged);
  const missing: number[] = [];
  let bytes = 0;
  for (const frame of manifest.frames) {
    if (acked.has(frame.index)) bytes += frame.bytes;
    else missing.push(frame.index);
  }
  // An acknowledgement for an index the manifest does not have is a corrupt state file, not progress.
  for (const index of state.acknowledged) {
    if (!manifest.frames.some((frame) => frame.index === index)) {
      throw stationProtocol('Transfer', `state acknowledges frame ${index}, which the manifest does not contain`, 'Discard the state file and restart the transfer from the seal.');
    }
  }
  return {
    sessionId: state.sessionId,
    acknowledgedParts: state.acknowledged.length,
    totalParts: manifest.frameCount,
    bytesAcknowledged: bytes,
    totalBytes: state.totalBytes,
    missing: Object.freeze(missing),
    complete: missing.length === 0,
  };
}

/** The frames still to send, in revolution order, so a resume does not reorder the session. */
export function resumePlan(state: TransferState, manifest: FrameManifest): readonly TransferPart[] {
  const acked = new Set(state.acknowledged);
  return Object.freeze(planFrameTransfer(manifest).filter((part) => !acked.has(part.index)));
}

export function assertTransferComplete(state: TransferState, manifest: FrameManifest): void {
  const progress = transferProgress(state, manifest);
  if (!progress.complete) throw transferIncomplete(manifest.sessionId, progress.missing.length, manifest.frameCount);
}

export function serializeTransferState(state: TransferState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** A state file edited by hand fails here rather than reporting a transfer that never happened. */
export function loadTransferState(json: string): TransferState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw inputInvalid('Transfer state is not valid JSON.', 'Restore the last good state file or restart the transfer.');
  }
  if (typeof raw !== 'object' || raw === null) throw inputInvalid('Transfer state is not an object.', 'Restore the last good state file.');
  const row = raw as Record<string, unknown>;
  const number = (name: string): number => {
    const value = row[name];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw inputInvalid(`Transfer state ${name} is ${JSON.stringify(value)}.`, 'State is written by the transfer step; regenerate it.');
    return value;
  };
  const text = (name: string): string => {
    const value = row[name];
    if (typeof value !== 'string' || !value) throw inputInvalid(`Transfer state ${name} is missing.`, 'State is written by the transfer step; regenerate it.');
    return value;
  };
  const acknowledgedRaw = row['acknowledged'];
  if (!Array.isArray(acknowledgedRaw) || acknowledgedRaw.some((v) => typeof v !== 'number' || !Number.isInteger(v))) {
    throw inputInvalid('Transfer state acknowledged list is malformed.', 'State is written by the transfer step; regenerate it.');
  }
  const core = {
    sessionId: text('sessionId'),
    manifestDigest: text('manifestDigest'),
    totalParts: number('totalParts'),
    totalBytes: number('totalBytes'),
    acknowledged: acknowledgedRaw as number[],
    updatedAt: text('updatedAt'),
  };
  const declared = text('stateDigest');
  if (digestState(core) !== declared) {
    throw stationProtocol('Transfer', 'state digest does not match its contents', 'The state file was edited outside the transfer step; discard it and resume from the origin acknowledgements.');
  }
  return Object.freeze({ ...core, acknowledged: Object.freeze([...core.acknowledged].sort((a, b) => a - b)), stateDigest: declared });
}
