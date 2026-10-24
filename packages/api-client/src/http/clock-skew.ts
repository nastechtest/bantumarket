/**
 * Clock skew: when "now" is not a client-side opinion.
 *
 * A handover window, an SLA clock and a capture-job deadline are all server facts. The instant a
 * server sends — `2026-10-30T08:00:00+02:00` — parses to the same absolute time on every device,
 * so reading a timestamp is safe. What is *not* safe is comparing it to the device clock: a buyer
 * whose phone has drifted five minutes is told either "the window closed" while the seller is still
 * waiting at the mall, or "you have time" while the token has expired server-side. Both are
 * disputes with a receipt attached.
 *
 * So the offset between device and server is computed once from a server-authored timestamp,
 * clamped by a plausibility bound, and then applied to every comparison this layer makes. The PHP
 * side already lives by this discipline: `WebhookVerifier::CLOCK_SKEW_TOLERANCE_SECONDS` is 300,
 * and a provider timestamp further from platform time than that is rejected outright rather than
 * trusted with a shrug. `SharedKernel/Clock.php` exists so that no expiring token depends on the
 * machine clock — this module is the browser's half of that decision.
 */

import { isRecord } from './errors.js';

/** South African Standard Time is UTC+2 all year — no DST, so an offset can be a constant. */
export const SAST_OFFSET_MINUTES = 120;

/**
 * Default plausibility bound: 12 hours. Below this a drift is a phone that lost its battery or a
 * user who set the clock by hand, and the server's own timestamp is still the better anchor. Above
 * it the response is more likely to be a broken proxy than a real clock, and silently adopting a
 * 3-year offset would corrupt every countdown in the app.
 */
export const DEFAULT_MAX_PLAUSIBLE_OFFSET_MS = 12 * 60 * 60 * 1000;

/** How long the first offset stays authoritative before a resync is allowed. */
export const DEFAULT_RESYNC_AFTER_MS = 15 * 60 * 1000;

/** A resync smaller than this is measurement noise; adopting it makes the clock jitter. */
export const RESYNC_HYSTERESIS_MS = 2000;

export interface ClockSkewOptions {
  /** Injectable so a test can simulate a drifting device. Defaults to the wall clock. */
  readonly localNow?: () => number;
  readonly maxPlausibleOffsetMs?: number;
  readonly resyncAfterMs?: number;
}

export type SkewStatus = 'unobserved' | 'synced' | 'implausible-server-time';

export interface ClockSkew {
  /** `serverTime - localTime`. Positive means the device clock is behind the ledger. */
  readonly offsetMs: number | undefined;
  readonly status: SkewStatus;
  /** Local ms at which the offset was taken, for a resync decision. */
  readonly observedAtLocalMs: number | undefined;
  /** The rejected observation, kept for the "check your device clock" line. */
  readonly rejectedOffsetMs: number | undefined;
  readonly isSynced: boolean;
  observe(serverTimeMs: number | undefined): boolean;
  /** The server's now, in epoch ms. Falls back to the device clock until the first observation. */
  serverNow(): number;
  /** Ms remaining until a server-issued instant, measured against server time. */
  msUntil(instant: string | number): number;
  isPast(instant: string | number): boolean;
  /** True when the device clock differs from the ledger by more than the webhook tolerance. */
  deviceClockSuspect(): boolean;
  reset(): void;
}

/**
 * `WebhookVerifier` rejects anything beyond 300 s; the same bound is what makes a device clock
 * worth calling "suspect" in the UI, because at that drift the platform itself would refuse the
 * device's own timestamped claims.
 */
export const SERVER_SKEW_TOLERANCE_MS = 300_000;

export function createClockSkew(options: ClockSkewOptions = {}): ClockSkew {
  const localNow = options.localNow ?? (() => Date.now());
  const maxPlausible = options.maxPlausibleOffsetMs ?? DEFAULT_MAX_PLAUSIBLE_OFFSET_MS;
  const resyncAfterMs = options.resyncAfterMs ?? DEFAULT_RESYNC_AFTER_MS;

  let offsetMs: number | undefined;
  let status: SkewStatus = 'unobserved';
  let observedAtLocalMs: number | undefined;
  let rejectedOffsetMs: number | undefined;

  const self: ClockSkew = {
    get offsetMs(): number | undefined {
      return offsetMs;
    },
    get status(): SkewStatus {
      return status;
    },
    get observedAtLocalMs(): number | undefined {
      return observedAtLocalMs;
    },
    get rejectedOffsetMs(): number | undefined {
      return rejectedOffsetMs;
    },
    get isSynced(): boolean {
      return offsetMs !== undefined;
    },

    /**
     * Called with the server's timestamp from each response (see `envelope.serverTimeMsOf`).
     * Returns true when the observation was adopted. The first plausible observation locks; later
     * ones only replace it after the resync window AND when they differ by more than the
     * hysteresis, so a load-balanced pair of servers two seconds apart cannot make our clock walk.
     */
    observe(serverTimeMs: number | undefined): boolean {
      if (serverTimeMs === undefined || !Number.isFinite(serverTimeMs)) return false;
      const localAtObservation = localNow();
      const candidate = serverTimeMs - localAtObservation;

      if (Math.abs(candidate) > maxPlausible) {
        rejectedOffsetMs = candidate;
        status = 'implausible-server-time';
        return false;
      }

      if (offsetMs === undefined) {
        offsetMs = candidate;
        observedAtLocalMs = localAtObservation;
        status = 'synced';
        return true;
      }

      if (status !== 'synced') {
        // A previously implausible anchor gets a clean second chance.
        offsetMs = candidate;
        observedAtLocalMs = localAtObservation;
        status = 'synced';
        rejectedOffsetMs = undefined;
        return true;
      }

      const aged = localAtObservation - (observedAtLocalMs ?? localAtObservation);
      if (aged >= resyncAfterMs && Math.abs(candidate - offsetMs) > RESYNC_HYSTERESIS_MS) {
        offsetMs = candidate;
        observedAtLocalMs = localAtObservation;
        return true;
      }
      return false;
    },

    serverNow(): number {
      return offsetMs === undefined ? localNow() : localNow() + offsetMs;
    },

    msUntil(instant: string | number): number {
      return toEpoch(instant) - self.serverNow();
    },

    isPast(instant: string | number): boolean {
      return self.msUntil(instant) <= 0;
    },

    deviceClockSuspect(): boolean {
      return (
        status === 'implausible-server-time' ||
        (offsetMs !== undefined && Math.abs(offsetMs) > SERVER_SKEW_TOLERANCE_MS)
      );
    },

    reset(): void {
      offsetMs = undefined;
      status = 'unobserved';
      observedAtLocalMs = undefined;
      rejectedOffsetMs = undefined;
    },
  };

  return self;
}

/**
 * Only absolute instants are accepted. A naive `2026-10-30T08:00:00` (no offset) is JS's local-time
 * interpretation of a server's wall clock, which is exactly the ambiguity this module exists to
 * remove — `DateTimeInterface::ATOM`, which PHP formats with, always carries the offset.
 */
export function toEpoch(instant: string | number): number {
  if (typeof instant === 'number') {
    if (!Number.isFinite(instant)) throw new TypeError('Server time must be a finite epoch-ms value.');
    return instant;
  }
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(instant);
  if (!hasOffset) throw new TypeError(`Server timestamp "${instant}" carries no UTC offset.`);
  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) throw new TypeError(`Unparseable server timestamp "${instant}".`);
  return parsed;
}

/**
 * The server's instant rendered for a South African reader: the same moment, labelled with the
 * offset the pilot actually operates in. Formatting only — the arithmetic above stays in epoch ms.
 */
export function toSastLabel(iso: string | number): string {
  const epoch = toEpoch(iso);
  const shifted = new Date(epoch + SAST_OFFSET_MINUTES * 60_000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(
    shifted.getUTCHours(),
  )}:${pad(shifted.getUTCMinutes())} SAST`;
}

/** Coarse "4 min left" copy for a countdown; never a substitute for the timestamp itself. */
export function remainingLabel(ms: number): string {
  if (ms <= 0) return 'closed';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return 'under a minute';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/**
 * Reads a server timestamp out of either envelope spelling (`meta.server_time` / `serverTime`) or a
 * raw `Date` header value. Used by `client.ts` so the two sources share one parse.
 */
export function serverTimeFromMeta(meta: unknown): number | undefined {
  if (!isRecord(meta)) return undefined;
  const raw = meta['server_time'] ?? meta['serverTime'] ?? meta['now'];
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') return undefined;
  try {
    return toEpoch(raw);
  } catch {
    return undefined;
  }
}
