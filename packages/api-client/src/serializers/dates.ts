/**
 * Timestamps: only absolute instants are accepted, and a `null` means what the schema says it means.
 *
 * The database emits `timestamptz` formatted with `DateTimeInterface::ATOM` (`Outbox.php`,
 * `HandoverToken::toArray()`), so every server timestamp arrives carrying an offset. That offset is
 * load-bearing: `paid_at`, `expires_at` and `created_at` decide a handover window, an SLA clock and
 * whether a payout is late, and a bare `2026-10-30T08:00:00` read in a browser on a different clock
 * setting is a different moment. A naive string is therefore rejected rather than guessed at — the
 * same refusal `Id::fromString` makes for an unusable identifier, applied to time.
 *
 * The other half is `null`. In `001_money_path.sql`, `paid_at`, `handover_confirmed_at`,
 * `completed_at` and `confirmed_at` are all nullable, and the null is a fact: "this has not happened
 * yet". Coercing it to epoch 0 would render "01/01/1970" on a receipt, and rendering it as the
 * current time would claim a handover happened. So the optional and required parsers are separate
 * functions and the optional one returns `null`, not `undefined` and not a date.
 */

import { contractViolation } from '../http/errors.js';

/** South African Standard Time: UTC+2, no daylight saving, so an offset can be a constant. */
export const SAST_OFFSET_MINUTES = 120;

const OFFSET_PATTERN = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(?:[zZ]|[+-]\d{2}:?\d{2})$/;

/**
 * Required timestamp: throws a contract violation for a missing, null, naive, or unparseable value.
 * Use this for fields the schema declares `NOT NULL` (`created_at`, `issued_at`, `recorded_at`).
 */
export function parseServerTimestamp(value: unknown, field: string): number {
  if (value === null || value === undefined) {
    throw contractViolation('unexpected_shape', field, value, 'a server timestamp with a UTC offset');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw contractViolation('bad_timestamp', field, value, 'a finite epoch-ms value');
    return value;
  }
  if (typeof value !== 'string') {
    throw contractViolation('unexpected_shape', field, value, 'an ISO-8601 string');
  }
  const trimmed = value.trim();
  if (!OFFSET_PATTERN.test(trimmed)) {
    // The whole reason this file exists: an offset-less server time is an unresolvable ambiguity,
    // not a value to be generously interpreted in the reader's own timezone.
    throw contractViolation('bad_timestamp', field, trimmed, 'an ISO-8601 instant carrying a UTC offset (PHP ATOM always does)');
  }
  const epoch = Date.parse(trimmed);
  if (Number.isNaN(epoch)) throw contractViolation('bad_timestamp', field, trimmed, 'a parseable ISO-8601 instant');
  return epoch;
}

/**
 * Nullable timestamp, for the columns the schema declares without `NOT NULL`. `null` is a real
 * answer ("not paid yet"); an unparseable string is a bug and still throws.
 */
export function parseOptionalServerTimestamp(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return parseServerTimestamp(value, field);
}

export function isServerTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!ISO_INSTANT.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/**
 * Format an epoch as the string the wire uses: ISO-8601 with an explicit offset. Defaults to SAST
 * because that is the only country in scope for the pilot, and a label that quietly switches zone
 * per device is a support conversation about a handover that "expired" early.
 */
export function formatIso(epochMs: number, offsetMinutes: number = SAST_OFFSET_MINUTES): string {
  if (!Number.isFinite(epochMs)) throw contractViolation('bad_timestamp', 'epochMs', epochMs, 'a finite epoch-ms value');
  const shifted = new Date(epochMs + offsetMinutes * 60_000);
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offsetLabel = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}` +
    offsetLabel
  );
}

/** The unambiguous machine form, used for logs, `Last-Event-ID`, and cursor payloads. */
export function formatUtcIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * A human label for a receipt or a dispute record: the instant, the zone, and the offset, so a
 * printed document cannot be read as somebody's local time. Legal-ish artefacts (ECT Act order
 * records) need the offset visible, not implied.
 */
export function formatWithZone(epochMs: number, offsetMinutes: number = SAST_OFFSET_MINUTES): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const abs = Math.abs(offsetMinutes);
  return `${formatIso(epochMs, offsetMinutes).slice(0, 16)} SAST (UTC${offsetMinutes >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

/**
 * Whether an instant falls inside `[start, end)`. Half-open because that is what the ledger does:
 * `commissions.policies` is `tstzrange(effective_from, effective_to, '[)')` with an application-side
 * `appliesTo` to match, and a policy window that closes inclusively would double-charge a sale made
 * at the changeover.
 */
export function withinHalfOpenWindow(atEpochMs: number, startEpochMs: number, endEpochMs: number): boolean {
  return atEpochMs >= startEpochMs && atEpochMs < endEpochMs;
}

/** Duration in whole seconds, floored at zero — a countdown that shows "-12 s" is a broken clock, not a UI bug. */
export function remainingSeconds(epochMs: number): number {
  return Math.max(0, Math.floor(epochMs / 1000));
}
