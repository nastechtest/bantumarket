/**
 * Missing-translation gap reporting.
 *
 * When `use-translation` has to fall through to English for a key that isiZulu does not have, that is
 * a real gap and we want to see it after launch — so `recordGap` writes a structured record: the key,
 * the requested locale, the locale that actually served the string, and the route it happened on.
 * That is enough to prioritise translation work per-language-per-page, and nothing more.
 *
 * Two safety properties the brief insists on:
 *   - It MUST NOT THROW in production. A missing translation is a content bug, never a reason to
 *     blank a checkout page; every observer/sink call is wrapped and failures are swallowed.
 *   - It MUST NOT log the surrounding user text. We store the stable message key, not the rendered
 *     English string and not any user-supplied interpolation values (a listing title or an offer can
 *     carry personal data). A gap report is telemetry, not a message archive.
 */

import type { Locale } from './locale.js';

export interface GapRecord {
  readonly key: string;
  readonly requested: Locale;
  /** The locale whose catalogue actually served the string (usually English as terminal fallback). */
  readonly servedBy: Locale;
  readonly route: string | null;
  readonly at: number; // epoch ms
}

export type GapListener = (record: GapRecord) => void;

// Bound the in-memory report so a long session cannot grow it without limit; oldest entries drop off.
const MAX_REPORT = 500;

const listeners = new Set<GapListener>();
const report: GapRecord[] = [];
let dedupSeen = new Set<string>();

function isProduction(): boolean {
  // Best-effort env read that never throws when `process` is absent (browser / worker).
  try {
    return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

/**
 * Record that `key` was absent in `requested` and served by `servedBy` on `route`. Deduplicated per
 * key/locale/route within the process so a list re-rendering 40 rows does not flood the report. Safe
 * to call from anywhere; never throws.
 */
export function recordGap(input: {
  readonly key: string;
  readonly requested: Locale;
  readonly servedBy: Locale;
  readonly route?: string | null;
}): void {
  try {
    const route = input.route ?? null;
    const dedupeKey = `${input.key}\u0000${input.requested}\u0000${route}`;
    if (dedupSeen.has(dedupeKey)) return;
    dedupSeen.add(dedupeKey);

    const record: GapRecord = {
      key: input.key,
      requested: input.requested,
      servedBy: input.servedBy,
      route,
      at: Date.now(),
    };

    report.push(record);
    if (report.length > MAX_REPORT) report.shift();

    for (const listener of listeners) {
      try {
        listener(record);
      } catch {
        // A listener is not allowed to break rendering; only surface it off the hot path.
        if (!isProduction()) {
          // eslint-disable-next-line no-console
          console.error('[i18n] gap listener threw');
        }
      }
    }
  } catch {
    // Reporting itself must never throw, in production or otherwise.
  }
}

/** Subscribe to gap records. Returns an unsubscribe function. Listener errors are contained. */
export function onGap(listener: GapListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A copy of the current report (oldest first). Safe for a debug overlay or a post-launch export. */
export function getGapReport(): readonly GapRecord[] {
  return report.slice();
}

/** Clear the report and the dedup set. Intended for tests and for an admin "reset telemetry". */
export function resetGaps(): void {
  report.length = 0;
  dedupSeen = new Set();
  listeners.clear();
}
