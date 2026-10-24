/**
 * The wire between the capture rig and the pipeline.
 *
 * The rig is a LAN device in a studio basement: one process talks to it over a plain TCP/HTTP
 * socket, so every message has to be self-describing, versioned and independently digestible.
 * Three decisions follow from that and none of them is stylistic:
 *
 * - **version in every envelope**, not only in the handshake. A rig that reconnects after a
 *   pipeline upgrade must be refused per message, not trusted because its first greeting was fine.
 * - **stable canonical encoding**, because a digest over `JSON.stringify` of an object whose key
 *   order depends on insertion is not reproducible across two runtimes. `canonicalJson` sorts keys.
 * - **a sequence number**, because a LAN hop that duplicates or reorders is exactly the condition
 *   a resumable transfer has to detect rather than guess around.
 */

import { createHash } from 'node:crypto';
import { stationProtocol } from '../errors.js';

export const PROTOCOL_VERSION = 1 as const;

/** The rig shoots a full turntable revolution. The 12-frame static path is a different mode. */
export const FRAMES_PER_SESSION = 120;

/** Default listener the station advertises. Recorded so an operator can firewall one port. */
export const STATION_PORT = 47811;

export const MESSAGE_KINDS = [
  'hello',
  'welcome',
  'calibration',
  'session_open',
  'frame_manifest',
  'chunk_ack',
  'transfer_complete',
  'operator_claim',
  'refused',
  'bye',
] as const;

export type StationMessageKind = (typeof MESSAGE_KINDS)[number];

export type StationBody = Readonly<Record<string, unknown>>;

export interface StationEnvelope {
  readonly v: typeof PROTOCOL_VERSION;
  readonly kind: StationMessageKind;
  readonly seq: number;
  readonly sessionId: string | null;
  readonly sentAt: string;
  readonly body: StationBody;
}

/**
 * Recursively key-sorted JSON. Arrays keep their order (a frame list is ordered on purpose);
 * object keys do not carry meaning, so they are sorted to make the digest reproducible.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  throw stationProtocol('Station message', `cannot encode a ${typeof value}`, 'Messages carry JSON values only.');
}

export function encodeEnvelope(envelope: StationEnvelope): string {
  assertEnvelope(envelope);
  return canonicalJson(envelope);
}

export function envelopeDigest(envelope: StationEnvelope): string {
  return createHash('sha256').update(encodeEnvelope(envelope), 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertEnvelope(value: unknown): asserts value is StationEnvelope {
  if (!isRecord(value)) throw stationProtocol('Station message', 'not a JSON object', 'Check the sender; a non-object frame is a framing bug.');
  if (value.v !== PROTOCOL_VERSION) {
    throw stationProtocol(
      'Station message',
      `protocol version ${String(value.v)} is not ${PROTOCOL_VERSION}`,
      'Upgrade the rig agent or run the pipeline version the rig was commissioned against; do not accept a mixed pair.',
      { got: value.v, expected: PROTOCOL_VERSION },
    );
  }
  if (typeof value.kind !== 'string' || !(MESSAGE_KINDS as readonly string[]).includes(value.kind)) {
    throw stationProtocol('Station message', `unknown kind ${JSON.stringify(value.kind)}`, `Known kinds: ${MESSAGE_KINDS.join(', ')}.`);
  }
  if (!Number.isInteger(value.seq) || (value.seq as number) < 1) {
    throw stationProtocol('Station message', `sequence ${JSON.stringify(value.seq)} is not a positive integer`, 'Sequence numbers start at 1 and never repeat within a session.');
  }
  if (value.sessionId !== null && (typeof value.sessionId !== 'string' || !value.sessionId.trim())) {
    throw stationProtocol('Station message', 'sessionId is neither null nor a non-empty string', 'A session id is opaque; omit it with null before the handshake completes.');
  }
  if (typeof value.sentAt !== 'string' || !Number.isFinite(Date.parse(value.sentAt))) {
    throw stationProtocol('Station message', `sentAt ${JSON.stringify(value.sentAt)} is not an instant`, 'Use an ISO-8601 instant from the station clock.');
  }
  if (!isRecord(value.body)) throw stationProtocol('Station message', 'body is not an object', 'Every kind carries a named body object.');
}

export function decodeEnvelope(text: string): StationEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw stationProtocol('Station message', 'is not JSON', 'Check the framing: one complete JSON object per message.');
  }
  assertEnvelope(raw);
  return {
    v: raw.v,
    kind: raw.kind as StationMessageKind,
    seq: raw.seq,
    sessionId: raw.sessionId,
    sentAt: raw.sentAt,
    body: raw.body,
  };
}

/** Enforces the ordering a single socket has to hold: strictly increasing, no gaps. */
export function assertNextSequence(lastSeq: number, next: StationEnvelope): void {
  if (next.seq !== lastSeq + 1) {
    throw stationProtocol(
      'Station message',
      `sequence ${next.seq} arrived after ${lastSeq}`,
      next.seq <= lastSeq
        ? 'A reused sequence is a replayed or duplicated message; drop it and re-open the session.'
        : 'A gap means a message was lost; re-open the session rather than acting on a partial stream.',
      { lastSeq, next: next.seq },
    );
  }
}

export function makeEnvelope(
  kind: StationMessageKind,
  seq: number,
  sessionId: string | null,
  body: StationBody,
  sentAt: string,
): StationEnvelope {
  return { v: PROTOCOL_VERSION, kind, seq, sessionId, sentAt, body };
}
