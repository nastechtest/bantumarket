/**
 * Draft persistence — local, private, and text only.
 *
 * The rule this file exists to enforce: a half-written dispute is an allegation about a named person
 * in a one-city pilot. It has not been reviewed, it may be something the buyer decides against
 * sending, and none of it belongs on a server. So drafts go to device storage, nothing is uploaded
 * behind the buyer's back, and there is a visible way to destroy them.
 *
 * Two deliberate absences:
 *   - no file content and no object URL. An object URL is dead on the next page load and a base64
 *     photo in localStorage is a 6 MB privacy liability that survives a logout. The draft records
 *     that the buyer attached nothing, and the files stay in the picker.
 *   - no sync, no telemetry, no analytics payload. `brief-21` may count "dispute started"; it must
 *     not be given the statement, and there is no seam here for it to do so.
 */

import type { DisputeSeverity } from './api/dispute-transport.js';

export const DRAFT_STORAGE_PREFIX = 'nastech.dispute.draft.v1.';

/** What a draft is allowed to contain. Read it as the whole privacy surface of the feature. */
export interface DisputeDraft {
  readonly version: 1;
  readonly orderId: string;
  readonly reasonCode: string | null;
  readonly severity: DisputeSeverity | null;
  readonly statement: string;
  /** Which intake step the buyer was on. Nothing else about progress is worth persisting. */
  readonly step: 'reason' | 'evidence' | 'review';
  readonly readRightsAcknowledged: boolean;
  /** Set from device storage's own clock — a draft timestamp is advisory, not a deadline. */
  readonly savedAt: string;
}

/** Minimal storage contract: `localStorage` satisfies it, a test satisfies it, Safari in private mode
 *  fails to construct one and gets `null` from `deviceStorage()` rather than throwing at render. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function draftKey(orderId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${encodeURIComponent(orderId)}`;
}

export function deviceStorage(): KVStorage | null {
  try {
    const candidate = globalThis.localStorage;
    if (candidate === undefined || candidate === null) return null;
    // Safari private mode hands you an object whose every write throws; probe it instead of trusting
    // the typeof check, or the first keystroke crashes the intake screen.
    const probe = `${DRAFT_STORAGE_PREFIX}__probe`;
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

export function memoryStorage(): KVStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export type DraftSaveResult = 'saved' | 'no_storage' | 'blocked_by_browser';

export function saveDraft(store: KVStorage | null, draft: DisputeDraft): DraftSaveResult {
  if (store === null) return 'no_storage';
  try {
    store.setItem(draftKey(draft.orderId), JSON.stringify(draft));
    return 'saved';
  } catch {
    // Quota exceeded or a session that locked storage after the probe. A draft that cannot be saved
    // must not become an error banner: the buyer is still typing, and their words are on screen.
    return 'blocked_by_browser';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

const SEVERITIES: readonly string[] = ['cosmetic', 'functional', 'unknown'];
const STEPS: readonly string[] = ['reason', 'evidence', 'review'];

/**
 * Load, with distrust. Storage is user-writable and shared with every other tab on this device, so a
 * draft that fails shape validation, belongs to another order, or carries a severity the transport
 * does not know is dropped rather than repaired. The worst outcome this can produce is a buyer
 * retyping a sentence; the alternative is rendering an allegation somebody else wrote into the box.
 */
export function loadDraft(store: KVStorage | null, orderId: string): DisputeDraft | null {
  if (store === null) return null;
  let raw: string | null;
  try {
    raw = store.getItem(draftKey(orderId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed['version'] !== 1) return null;
  if (parsed['orderId'] !== orderId) return null;
  if (typeof parsed['statement'] !== 'string') return null;
  const severity = parsed['severity'];
  if (severity !== null && !(typeof severity === 'string' && SEVERITIES.includes(severity))) return null;
  const step = parsed['step'];
  if (typeof step !== 'string' || !STEPS.includes(step)) return null;
  const savedAt = parsed['savedAt'];
  if (typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) return null;

  return {
    version: 1,
    orderId,
    reasonCode: optionalStringOrNull(parsed['reasonCode']),
    severity: typeof severity === 'string' ? (severity as DisputeSeverity) : null,
    statement: parsed['statement'],
    step: step as DisputeDraft['step'],
    readRightsAcknowledged: parsed['readRightsAcknowledged'] === true,
    savedAt,
  };
}

export type DraftClearResult = 'cleared' | 'no_storage' | 'nothing_stored' | 'blocked_by_browser';

export function clearDraft(store: KVStorage | null, orderId: string): DraftClearResult {
  if (store === null) return 'no_storage';
  const key = draftKey(orderId);
  try {
    if (store.getItem(key) === null) return 'nothing_stored';
    store.removeItem(key);
    return 'cleared';
  } catch {
    return 'blocked_by_browser';
  }
}

export function hasDraft(store: KVStorage | null, orderId: string): boolean {
  return loadDraft(store, orderId) !== null;
}

/** The statement a draft is allowed to carry is capped by the intake's own ceiling; a storage quirk
 *  must not be able to smuggle a 5 MB statement into the review screen. */
export function draftFromInput(input: {
  orderId: string;
  reasonCode: string | null;
  severity: DisputeSeverity | null;
  statement: string;
  step: DisputeDraft['step'];
  readRightsAcknowledged: boolean;
  savedAt: string;
}): DisputeDraft {
  return {
    version: 1,
    orderId: input.orderId,
    reasonCode: input.reasonCode,
    severity: input.severity,
    statement: input.statement.slice(0, 4000),
    step: input.step,
    readRightsAcknowledged: input.readRightsAcknowledged,
    savedAt: input.savedAt,
  };
}
