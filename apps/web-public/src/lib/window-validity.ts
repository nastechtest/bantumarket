/**
 * Handover window validity — the only place in the app allowed to answer "is the exchange
 * window open right now?".
 *
 * Three rules this file exists to enforce:
 *   1. Time is SAST (UTC+2, no DST — there is no DST to get wrong, which is why a fixed offset
 *      is legitimate here and nowhere else). Display instants are formatted with explicit UTC
 *      getters against a shifted epoch; NO local `Date` getter (`getFullYear`, `getHours`,
 *      `getTimezoneOffset`, `toLocaleString`) is ever called, so a client phone set to
 *      Johannesburg-pretending-to-be-Tokyo cannot shift a deadline. `window.test.ts` enforces
 *      this by making those getters throw while running the code below.
 *   2. Time is server-derived. `nowMs` is always supplied by the caller from a server response,
 *      never read from the device here.
 *   3. The client clock may be wrong by up to 90 seconds in either direction. Near a window
 *      edge the honest answer is `edge`, not `open` and not `expired` — the server's clock
 *      decides, and the UI must say so instead of flipping a lie at T±0.
 */

export const SAST_OFFSET_MINUTES = 120;
export const MAX_CLOCK_SKEW_MS = 90_000;

const SAST_OFFSET_MS = SAST_OFFSET_MINUTES * 60_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Parses the server's instant (ATOM like `2026-10-08T18:45:00+02:00`, or Zulu). A bare
 * wall-clock string with no offset is interpreted as SAST — the server only ever speaks SAST,
 * and silently letting the device's zone fill the gap is exactly the bug class this file is
 * built to kill.
 */
export function parseServerInstant(value: string): number {
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const ms = Date.parse(hasOffset ? value : `${value}+02:00`);
  if (Number.isNaN(ms)) throw new RangeError(`Unparseable server instant: "${value}"`);
  return ms;
}

export interface SastMoment {
  /** `YYYY-MM-DD` in SAST — a date label, never fed back into a Date. */
  readonly date: string;
  /** `HH:MM` in SAST. */
  readonly time: string;
  /** Human label carrying its own zone, so screenshots cannot migrate into a wrong TZ. */
  readonly label: string;
}

/** Formats an epoch-ms instant as SAST using only UTC getters plus a fixed shift. */
export function formatSast(instantMs: number): SastMoment {
  const shifted = new Date(instantMs + SAST_OFFSET_MS);
  const date = `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
  const time = `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
  const weekday = WEEKDAYS[shifted.getUTCDay()] ?? 'Sun';
  const month = MONTHS[shifted.getUTCMonth()] ?? 'Jan';
  return { date, time, label: `${weekday} ${shifted.getUTCDate()} ${month}, ${time} SAST` };
}

export type WindowStatus = 'before' | 'open' | 'edge' | 'expired';
export type WindowEdge = 'opening' | 'closing';

export interface WindowEvaluation {
  readonly status: WindowStatus;
  /** Only present when status is `edge`: which boundary the skew is blurring. */
  readonly edge?: WindowEdge;
  readonly msToExpiry: number;
  readonly withinSkew: boolean;
}

/**
 * Evaluates `opensAtMs <= now < expiresAtMs` with skew tolerance. `expiresAt - opensAt` is the
 * window the PHP `ScheduleHandover` configured (`DateInterval $window`); it may straddle
 * midnight SAST — the epoch arithmetic does not care, and `windowStraddlesMidnight` tells the
 * copy that the window ends "tomorrow".
 */
export function evaluateWindow(nowMs: number, opensAtMs: number, expiresAtMs: number): WindowEvaluation {
  if (!(expiresAtMs > opensAtMs)) {
    throw new RangeError(`Handover window must move forward: opens ${opensAtMs}, expires ${expiresAtMs}`);
  }
  const msToExpiry = expiresAtMs - nowMs;
  if (nowMs < opensAtMs - MAX_CLOCK_SKEW_MS) {
    return { status: 'before', msToExpiry, withinSkew: false };
  }
  if (nowMs > expiresAtMs + MAX_CLOCK_SKEW_MS) {
    // Strict `>` keeps the skew band symmetric: T+90s is still `edge` (the server may not have
    // closed it yet), T+91s is closed. An inclusive bound would make "exactly 90 s wrong" mean
    // different things at the two boundaries.
    return { status: 'expired', msToExpiry, withinSkew: false };
  }
  if (nowMs < opensAtMs) {
    return { status: 'edge', edge: 'opening', msToExpiry, withinSkew: true };
  }
  if (msToExpiry <= MAX_CLOCK_SKEW_MS) {
    return { status: 'edge', edge: 'closing', msToExpiry, withinSkew: true };
  }
  return { status: 'open', msToExpiry, withinSkew: false };
}

/** Short remaining-time label for the open window bar. */
export function remainingLabel(msToExpiry: number): string {
  if (msToExpiry <= 0) return 'the window has closed';
  const totalMinutes = Math.floor(msToExpiry / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min left`;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} d ${hours} h left`;
  return minutes === 0 ? `${hours} h left` : `${hours} h ${minutes} min left`;
}

export function windowStraddlesMidnight(opensAtMs: number, expiresAtMs: number): boolean {
  return formatSast(opensAtMs).date !== formatSast(expiresAtMs).date;
}

/** One-line honest status copy per evaluation; the component adds the money context. */
export function windowStatusLine(evaluation: WindowEvaluation): string {
  switch (evaluation.status) {
    case 'before':
      return 'The meet-up window has not opened yet.';
    case 'open':
      return `Window open — ${remainingLabel(evaluation.msToExpiry)}.`;
    case 'edge':
      return evaluation.edge === 'opening'
        ? 'The window is opening right now — the server’s clock, not your phone, decides.'
        : 'This window is closing on the server’s clock. If the code is refused, reissue — it does not cost you money.';
    case 'expired':
      return 'The handover window has closed; reissue a new one before meeting.';
  }
}

export interface WindowView {
  readonly evaluation: WindowEvaluation;
  readonly opens: SastMoment;
  readonly expires: SastMoment;
  readonly crossesToNextDay: boolean;
}

/** Convenience for the window bar: evaluate and format together, from server-derived inputs. */
export function describeWindow(nowMs: number, opensAtIso: string, expiresAtIso: string): WindowView {
  const opensAtMs = parseServerInstant(opensAtIso);
  const expiresAtMs = parseServerInstant(expiresAtIso);
  return {
    evaluation: evaluateWindow(nowMs, opensAtMs, expiresAtMs),
    opens: formatSast(opensAtMs),
    expires: formatSast(expiresAtMs),
    crossesToNextDay: windowStraddlesMidnight(opensAtMs, expiresAtMs),
  };
}
