/**
 * Time arithmetic and display for a dispute, with the clock kept where the brief demands it: on the
 * service.
 *
 * Nothing in this file reads `Date.now()` on its own initiative — every function takes the instant it
 * is measuring from. That is the difference between a real SLA reading and a lie: a countdown started
 * at page load tells a buyer who closes the tab on Tuesday that they had the same time left on
 * Friday, and it drifts on a handset with a wrong date. The service's `asOf` is the only "now" a
 * dispute screen is allowed to use.
 *
 * Display is pinned to Africa/Johannesburg (UTC+2, no daylight saving) and formatted by hand rather
 * than through `Intl.DateTimeFormat` for the same reason `design-system/format.ts` does it for money:
 * ICU builds vary, a disputed date has to be identical in a test, in a build, and in the letter a
 * buyer prints, and the launch market is one country.
 */

export const SAST_OFFSET_MINUTES = 120;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface InstantParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly weekday: number;
}

/**
 * ISO-8601 string → the parts as a Johannesburg reader expects them.
 * Accepts a `Z`, an explicit offset, or a date-only stamp (which is midnight UTC, per RFC 3339).
 */
export function instantFromIso(iso: string): InstantParts {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(ms)) throw new TypeError(`Not an ISO-8601 timestamp: ${iso}`);
  const shifted = new Date(ms + SAST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** "Friday 12 June 2026" — a date a buyer can point at in a message to the seller. */
export function formatLongDate(iso: string): string {
  const p = instantFromIso(iso);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "12 June 2026, 14:05" — for timeline rows, where the minute matters. */
export function formatTimestamp(iso: string): string {
  const p = instantFromIso(iso);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${hh}:${mm}`;
}

/** Whole calendar days from `fromIso` to `toIso`, rounded down, floored at zero. */
export function wholeDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso.length === 10 ? `${fromIso}T00:00:00Z` : fromIso);
  const to = Date.parse(toIso.length === 10 ? `${toIso}T00:00:00Z` : toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

/** Signed day difference; negative means the deadline has passed. */
export function signedDaysUntil(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso.length === 10 ? `${fromIso}T00:00:00Z` : fromIso);
  const to = Date.parse(toIso.length === 10 ? `${toIso}T00:00:00Z` : toIso);
  return Math.floor((to - from) / 86_400_000);
}

export function addDaysIso(iso: string, days: number): string {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(ms)) throw new TypeError(`Not an ISO-8601 timestamp: ${iso}`);
  return new Date(ms + days * 86_400_000).toISOString();
}

export interface DurationReading {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly past: boolean;
}

/** Duration between two stamps, with `past` telling you which way the gap runs so no caller has to
 *  infer a deadline's direction from a negative number. */
export function durationBetween(fromIso: string, toIso: string): DurationReading {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const signed = to - from;
  const abs = Math.abs(Number.isNaN(signed) ? 0 : signed);
  return {
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    past: signed < 0,
  };
}

/** "3 days 4 hours" / "1 hour 6 minutes" / "under a minute". Never "0 days". */
export function formatDuration(reading: DurationReading): string {
  if (reading.days > 0) return `${reading.days} ${reading.days === 1 ? 'day' : 'days'} ${reading.hours} ${reading.hours === 1 ? 'hour' : 'hours'}`;
  if (reading.hours > 0) return `${reading.hours} ${reading.hours === 1 ? 'hour' : 'hours'} ${reading.minutes} ${reading.minutes === 1 ? 'minute' : 'minutes'}`;
  if (reading.minutes > 0) return `${reading.minutes} ${reading.minutes === 1 ? 'minute' : 'minutes'}`;
  return 'under a minute';
}
