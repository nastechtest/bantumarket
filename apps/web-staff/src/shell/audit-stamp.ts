import type { StaffRole } from './role.js';

/**
 * The stamp every mutation carries. It is not a log line added afterwards: the transport receives
 * the stamp as an argument, so a mutation that was not attributed cannot be represented at all.
 */
export interface AuditStamp {
  readonly actor: string;
  readonly role: StaffRole;
  readonly target: string;
  readonly reason: string;
  /** ISO-8601 instant from the server's clock. */
  readonly at: string;
}

export interface AuditStampInput {
  readonly actor: string;
  readonly role: StaffRole;
  readonly target: string;
  readonly reason: string;
  readonly at: string;
}

export class AuditStampError extends Error {
  readonly field: string;

  constructor(field: string, detail: string) {
    super(`audit-stamp: ${detail}`);
    this.name = 'AuditStampError';
    this.field = field;
  }
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && ISO_RE.test(value) && !Number.isNaN(Date.parse(value));
}

/** A reason has to say something a stranger could review six months later. */
export const MIN_REASON_LENGTH = 8;

export function createAuditStamp(input: AuditStampInput): AuditStamp {
  if (!input.actor.trim()) throw new AuditStampError('actor', 'actor is required');
  if (!input.role) throw new AuditStampError('role', 'role is required');
  if (!input.target.trim()) throw new AuditStampError('target', 'target is required');
  if (input.reason.trim().length < MIN_REASON_LENGTH) {
    throw new AuditStampError('reason', `reason must be at least ${MIN_REASON_LENGTH} characters`);
  }
  if (!isIsoInstant(input.at)) throw new AuditStampError('at', 'timestamp must be an ISO-8601 UTC instant');
  return {
    actor: input.actor.trim(),
    role: input.role,
    target: input.target.trim(),
    reason: input.reason.trim(),
    at: input.at,
  };
}

export function isAuditStamp(value: unknown): value is AuditStamp {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['actor'] === 'string' &&
    record['actor'].length > 0 &&
    typeof record['role'] === 'string' &&
    record['role'].length > 0 &&
    typeof record['target'] === 'string' &&
    record['target'].length > 0 &&
    typeof record['reason'] === 'string' &&
    record['reason'].trim().length >= MIN_REASON_LENGTH &&
    isIsoInstant(record['at'])
  );
}

export function assertAuditStamp(value: unknown): asserts value is AuditStamp {
  if (value === undefined || value === null) throw new AuditStampError('stamp', 'a stamp is required for every mutation');
  if (!isAuditStamp(value)) throw new AuditStampError('stamp', 'the stamp is incomplete or malformed');
}

/** One line for an audit row: actor, role, target, reason, instant. */
export function auditStampLine(stamp: AuditStamp): string {
  return `${stamp.actor} (${stamp.role}) → ${stamp.target}: ${stamp.reason} @ ${stamp.at}`;
}

/** A reviewable change list, for the before/after row an auditor reads. */
export interface StampDiff {
  readonly term: string;
  readonly before: string;
  readonly after: string;
}

export function stampDiff(before: AuditStamp, after: AuditStamp): readonly StampDiff[] {
  const fields: ReadonlyArray<readonly [keyof AuditStamp, string]> = [
    ['actor', 'Actor'],
    ['role', 'Role'],
    ['target', 'Target'],
    ['reason', 'Reason'],
    ['at', 'Timestamp'],
  ];
  return fields
    .filter(([key]) => before[key] !== after[key])
    .map(([key, term]) => ({ term, before: String(before[key]), after: String(after[key]) }));
}
