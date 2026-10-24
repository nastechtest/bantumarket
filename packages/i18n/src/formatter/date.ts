/**
 * Dates in South African Standard Time.
 *
 * Two things this file is accountable for, in the brief's words: SAST (UTC+2, no DST) and "never uses
 * the client's timezone for a legal timestamp".
 *
 * SAST has no daylight saving, so the offset is a fixed 120 minutes — the correct and fully
 * deterministic implementation is arithmetic on the instant, not `Intl`/`toLocaleString`, whose
 * `en-ZA` output shifts with whatever `TZ` the host process runs under. Every input is first reduced
 * to a UTC epoch (so an ISO string's own `Z`/offset is honoured), then the +2h offset is added and the
 * UTC getters are read as the SAST wall clock. A legal timestamp therefore renders identically on a
 * Cape Town server, a UTC runner, and a browser in Berlin.
 *
 * Month/day names: Afrikaans and English long/short forms are provided (both defensible). The Nguni
 * weekday names are established and shipped, but Zulu/Xhosa *month* names vary by source and are not
 * guessed — those locales render a numeric month rather than a fabricated translation, consistent with
 * the catalogue's "a gap, never a fake".
 */

import type { Locale } from '../locale.js';

/** SAST is UTC+2 all year: South Africa has not observed DST since 2006 (and none is planned). */
export const SAST_OFFSET_MINUTES = 120;
export const SAST_ZONE = 'UTC+02:00';

export type TemporalInput = Date | number | string;

interface Parts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23, SAST
  readonly minute: number;
  readonly second: number;
  readonly weekday: number; // 0 = Sunday .. 6 = Saturday, in SAST
}

/** Coerce any input to a UTC epoch ms. Throws rather than silently rendering "Invalid Date". */
export function toEpoch(input: TemporalInput): number {
  if (input instanceof Date) {
    const t = input.getTime();
    if (Number.isNaN(t)) throw new TypeError('date: invalid Date (NaN epoch)');
    return t;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new TypeError('date: invalid epoch number');
    return input;
  }
  const t = Date.parse(input);
  if (Number.isNaN(t)) throw new TypeError(`date: unparseable timestamp ${JSON.stringify(input)}`);
  return t;
}

function sastParts(input: TemporalInput): Parts {
  const shifted = new Date(toEpoch(input) + SAST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

const MONTHS_LONG: Partial<Record<Locale, readonly string[]>> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  af: [
    'Januarie', 'Februarie', 'Maart', 'April', 'Mei', 'Junie',
    'Julie', 'Augustus', 'September', 'Oktober', 'November', 'Desember',
  ],
};

const MONTHS_SHORT: Partial<Record<Locale, readonly string[]>> = {
  en: ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'],
  af: ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'],
};

const WEEKDAYS: Partial<Record<Locale, readonly string[]>> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  af: ['Sondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrydag', 'Saterdag'],
  // Established Nguni weekday names (not month names) — defensible, so shipped.
  zu: ['iSonto', 'uMsombuluko', 'uLwesibili', 'uLwesithathu', 'uLwesine', 'uLwesihlanu', 'uMgqibelo'],
  xh: ['iCawa', 'uMvulo', 'uLwesibini', 'uLwesithathu', 'uLwesine', 'uLwesihlanu', 'uMgqibelo'],
};

/**
 * A date as read on a wall clock in SAST: `12 Oct 2026` (en/af), `12/10/2026` for the locales whose
 * month names we do not assert. Time is excluded — this is a date, not a timestamp.
 */
export function formatDate(input: TemporalInput, locale: Locale, style: 'long' | 'short' = 'long'): string {
  const p = sastParts(input);
  const month = p.month - 1;
  if (style === 'long' && MONTHS_LONG[locale]?.[month]) {
    return `${p.day} ${MONTHS_LONG[locale]![month]} ${p.year}`;
  }
  if (style === 'short' && MONTHS_SHORT[locale]?.[month]) {
    return `${p.day} ${MONTHS_SHORT[locale]![month]} ${p.year}`;
  }
  // Numeric fallback, day/month/year (the SA convention), for locales without asserted month names.
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
}

/** Date and 24-hour SAST clock, e.g. `12 Oct 2026, 14:05`. */
export function formatDateTime(input: TemporalInput, locale: Locale): string {
  const p = sastParts(input);
  return `${formatDate(input, locale)}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Localised weekday name for the SAST date, falling back to the numeric date when unknown. */
export function formatWeekday(input: TemporalInput, locale: Locale): string {
  const name = WEEKDAYS[locale]?.[sastParts(input).weekday];
  return name ?? formatDate(input, locale);
}

/**
 * The canonical legal timestamp: ISO-8601 with an explicit `+02:00` SAST offset and no client-timezone
 * dependence. Dispute/handover records store and display this string; because it carries its own
 * offset it is unambiguous wherever it is read.
 */
export function formatLegalTimestamp(input: TemporalInput): string {
  const p = sastParts(input);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}+02:00`;
}
