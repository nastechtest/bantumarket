/**
 * Building, reading and mutating the consent record.
 *
 * Three properties the rest of the app depends on, each of which is a test:
 *
 *  1. **Deny by default.** The starting record refuses every gated category. A buyer who never sees
 *     the banner, dismisses it by scrolling, or has a stored record that fails to parse is refusing,
 *     not "unspecified". POPIA s11(3)(a) consent is affirmative; the absence of an answer is not one.
 *  2. **A record cannot lie.** `withDecision` refuses to write a `granted` for `marketing` (we do not
 *     process for it, so holding that permission would be a record of a power we should not have) and
 *     refuses any decision for `essential` (it is not a consent question — see `lawful-basis.ts`).
 *  3. **Nothing here reads the clock or the environment itself.** `now` is passed in, storage is
 *     passed in, so the timestamps in a legal record are testable and the store cannot quietly start
 *     measuring device time one day.
 */
import {
  CONSENT_METHODS,
  DECISION_CATEGORIES,
  DECISION_LOG_CAP,
  NEVER_COLLECTED,
  isConsentCategory,
  isConsentMethod,
} from './types.js';
import type {
  CategoryDecision,
  ConsentCategory,
  ConsentMethod,
  ConsentRecord,
  ConsentStorage,
  DecisionValue,
} from './types.js';

export const CONSENT_NOTICE_VERSION = 'popia-notice-2026-04';

export class ConsentRecordError extends Error {
  readonly detail: Record<string, unknown>;

  constructor(message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ConsentRecordError';
    this.detail = detail;
  }
}

/**
 * The state before anyone has been asked: every decision category refused via `imported_from_v0`?
 * No — refused with an explicit method that says we hold no answer. `banner_refuse_all` would claim
 * a buyer pressed refuse; `imported_from_v0` would claim a migration happened. Neither is true, so
 * the record itself has to carry the distinction.
 *
 * Rather than invent a fifth method and make the union a lie somewhere else, the starting record is
 * version 0 with an empty log: `hasExplicitDecision()` is what tells the banner to appear.
 */
export function initialRecord(now: number, noticeVersion: string = CONSENT_NOTICE_VERSION): ConsentRecord {
  return {
    version: 0,
    createdAt: now,
    updatedAt: now,
    noticeVersion,
    decisions: [],
    decisionLog: [],
  };
}

export function hasExplicitDecision(record: ConsentRecord): boolean {
  return record.version > 0 && record.decisions.length === DECISION_CATEGORIES.length;
}

export function decisionFor(record: ConsentRecord, category: ConsentCategory): CategoryDecision | undefined {
  return record.decisions.find((d) => d.category === category);
}

/**
 * The one question the gates ask. Written as a total function over categories rather than a lookup
 * with a default, because the dangerous bug in this file is a `switch` that falls through to `true`.
 */
export function categoryAllowed(record: ConsentRecord, category: ConsentCategory): boolean {
  // `essential` has a lawful basis and is not consented; refusing it is not a thing a buyer can do
  // and not a thing this function can be asked to pretend.
  if (category === 'essential') return true;
  if (NEVER_COLLECTED.includes(category)) return false;
  return decisionFor(record, category)?.value === 'granted';
}

export function grantedCategories(record: ConsentRecord): readonly ConsentCategory[] {
  return record.decisions.filter((d) => d.value === 'granted').map((d) => d.category);
}

export interface DecisionInit {
  readonly category: (typeof DECISION_CATEGORIES)[number];
  readonly value: DecisionValue;
  readonly method: ConsentMethod;
  readonly now: number;
  readonly noticeVersion?: string;
}

/**
 * Apply one decision. Version bumps, the current state is replaced, the log appends, and a decision
 * that repeats the current value is still recorded — a buyer who refuses, accepts, then refuses
 * again is a different person to a record than one who never chose, and POPIA s23 gives them the
 * right to see that.
 */
export function withDecision(record: ConsentRecord, init: DecisionInit): ConsentRecord {
  assertWritableDecision(init.category, init.value);
  if (!Number.isFinite(init.now) || init.now < 0) {
    throw new ConsentRecordError(`consent record: now must be a non-negative finite number, got ${init.now}`);
  }

  const decision: CategoryDecision = {
    category: init.category,
    value: init.value,
    decidedAt: init.now,
    method: init.method,
    noticeVersion: init.noticeVersion ?? record.noticeVersion,
  };

  const withoutCategory = record.decisions.filter((d) => d.category !== init.category);
  const decisions = [...withoutCategory, decision].sort((a, b) =>
    DECISION_CATEGORIES.indexOf(a.category) - DECISION_CATEGORIES.indexOf(b.category),
  );

  return {
    version: record.version + 1,
    createdAt: record.createdAt,
    updatedAt: init.now,
    noticeVersion: decision.noticeVersion,
    decisions,
    decisionLog: appendCapped(record.decisionLog, decision, DECISION_LOG_CAP),
  };
}

export function withDecisions(
  record: ConsentRecord,
  entries: readonly { category: (typeof DECISION_CATEGORIES)[number]; value: DecisionValue }[],
  method: ConsentMethod,
  now: number,
): ConsentRecord {
  return entries.reduce((acc, e) => withDecision(acc, { category: e.category, value: e.value, method, now }), record);
}

/**
 * Withdrawal is not `refused` under a different name: the method has to be visible, because the
 * obligation that follows (stop sending, discard what is buffered, rotate the id) is triggered by
 * the *withdrawal*, and a support agent reading the log needs to find the moment.
 */
export function withdraw(record: ConsentRecord, category: (typeof DECISION_CATEGORIES)[number], now: number): ConsentRecord {
  return withDecision(record, { category, value: 'refused', method: 'withdrawal', now });
}

function assertWritableDecision(category: string, value: DecisionValue): void {
  if (!isConsentCategory(category)) {
    throw new ConsentRecordError(`consent record: unknown category ${JSON.stringify(category)}`);
  }
  if (category === 'essential') {
    throw new ConsentRecordError(
      'consent record: `essential` has a lawful basis, not a consent — recording a decision for it would imply a choice the buyer never had',
    );
  }
  if (NEVER_COLLECTED.includes(category as ConsentCategory) && value === 'granted') {
    throw new ConsentRecordError(
      `consent record: refusing to store a granted decision for "${category}" — we do not process for it, so that permission would be a record of a power we should not hold`,
    );
  }
}

function appendCapped(log: readonly CategoryDecision[], entry: CategoryDecision, cap: number): readonly CategoryDecision[] {
  const next = [...log, entry];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/* ------------------------------------------------------------------ serialise */

export function serialiseRecord(record: ConsentRecord): string {
  return JSON.stringify(record);
}

/**
 * Parse defensively. Every failure mode returns `null` and the caller falls back to the denying
 * record: a corrupt, truncated, hand-edited or future-versioned blob must never be able to *grant*
 * anything by being mis-read, and it must never throw inside a render.
 */
export function parseRecord(raw: string | null): ConsentRecord | null {
  if (raw === null || raw.length === 0) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.version !== 'number' || !Number.isInteger(candidate.version) || candidate.version < 0) return null;
  if (typeof candidate.noticeVersion !== 'string' || candidate.noticeVersion.length === 0) return null;
  if (typeof candidate.createdAt !== 'number' || typeof candidate.updatedAt !== 'number') return null;
  if (!Array.isArray(candidate.decisions) || !Array.isArray(candidate.decisionLog)) return null;

  const decisions = candidate.decisions.map(parseDecision);
  // A record we cannot read completely is not a record. Partial parsing is the dangerous option:
  // the entry that fails validation is exactly the one a hand-edit or a future bug would corrupt,
  // and silently dropping it would leave the *rest* of the blob in force.
  if (decisions.some((d) => d === null)) return null;
  const parsedDecisions = decisions as CategoryDecision[];
  if (new Set(parsedDecisions.map((d) => d.category)).size !== parsedDecisions.length) return null;

  // A record that claims `granted` for a category we never collect is not a record we accept; that
  // is the exact shape a future bug or a hand-edit would produce, and it must fail closed.
  if (parsedDecisions.some((d) => NEVER_COLLECTED.includes(d.category) && d.value === 'granted')) return null;

  const parsedLog = candidate.decisionLog.map(parseDecision);
  if (parsedLog.some((d) => d === null)) return null;

  return {
    version: candidate.version,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    noticeVersion: candidate.noticeVersion,
    decisions: parsedDecisions.sort((a, b) => DECISION_CATEGORIES.indexOf(a.category) - DECISION_CATEGORIES.indexOf(b.category)),
    decisionLog: (parsedLog as CategoryDecision[]).slice(-DECISION_LOG_CAP),
  };
}

function parseDecision(value: unknown): CategoryDecision | null {
  if (typeof value !== 'object' || value === null) return null;
  const d = value as Record<string, unknown>;
  if (!isConsentCategory(d.category) || !DECISION_CATEGORIES.includes(d.category as (typeof DECISION_CATEGORIES)[number])) {
    return null;
  }
  if (d.value !== 'granted' && d.value !== 'refused') return null;
  if (typeof d.decidedAt !== 'number' || !Number.isFinite(d.decidedAt)) return null;
  if (!isConsentMethod(d.method)) return null;
  if (typeof d.noticeVersion !== 'string') return null;
  return {
    category: d.category as (typeof DECISION_CATEGORIES)[number],
    value: d.value,
    decidedAt: d.decidedAt,
    method: d.method,
    noticeVersion: d.noticeVersion,
  };
}

/* ------------------------------------------------------------------ storage */

/**
 * Load or deny. A storage layer that throws (Safari private mode, a full quota, an extension that
 * hooked `localStorage`) is indistinguishable from "the buyer has not been asked", which is the
 * denying state — so the fallback is the initial record and no category is on.
 */
export function loadRecord(storage: ConsentStorage, key: string, now: number, noticeVersion = CONSENT_NOTICE_VERSION): ConsentRecord {
  let raw: string | null = null;
  try {
    raw = storage.read(key);
  } catch {
    raw = null;
  }
  const parsed = parseRecord(raw);
  if (parsed === null) return initialRecord(now, noticeVersion);
  // The notice moved and the old consent was taken against different words: the record is kept for
  // the evidence trail, but the version stamp updates so the UI knows to ask again.
  return parsed.noticeVersion === noticeVersion ? parsed : { ...parsed, noticeVersion };
}

export function persistRecord(storage: ConsentStorage, key: string, record: ConsentRecord): boolean {
  try {
    return storage.write(key, serialiseRecord(record));
  } catch {
    return false;
  }
}

/**
 * POPIA s23(1) access / s24(1) deletion. Removing the record *cannot* silently reopen consent: the
 * caller must also stop every gate and drop the buffer, which is `withdraw.ts`'s job, not this
 * function's. Erasing on its own would leave a session id in flight with no record of permission.
 */
export function eraseRecord(storage: ConsentStorage, key: string): boolean {
  try {
    storage.remove(key);
    return true;
  } catch {
    return false;
  }
}

/** For the access-request export: the record plus the category registry it has to be read against. */
export function recordForExport(record: ConsentRecord): string {
  return JSON.stringify(
    {
      kind: 'consent_record',
      exportedAtFields: ['version', 'createdAt', 'updatedAt', 'noticeVersion'],
      record,
      methodsKnown: CONSENT_METHODS,
    },
    null,
    2,
  );
}
