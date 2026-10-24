/**
 * The consent store as the app meets it: an observable, synchronous gate plus the actions a banner,
 * a preferences sheet and an access-request screen need.
 *
 * Deliberately *not* a React thing: `useSyncExternalStore` lives in `banner.tsx`, and the manager is a
 * plain object so the queue, the tracker and the tests can hold one without a component tree. This is
 * also what lets the app bootstrap measure a page view before the first render — the record is read
 * from storage synchronously at construction.
 *
 * Two behaviours that are the point of the file:
 *  · `subscribe` fires on every version bump, which is how the session manager learns it must rotate;
 *  · `persisted` is reported honestly. When storage refused the write, the manager says so, because a
 *    banner that implies "saved" while nothing survived would be a lie about a consent.
 */
import {
  CONSENT_GATED,
  CONSENT_STORAGE_KEY,
  DECISION_CATEGORIES,
  isConsentCategory,
} from '../../../lib/consent/types.js';
import type { ConsentCategory, ConsentRecord, ConsentStorage, DecisionValue } from '../../../lib/consent/types.js';
import {
  CONSENT_NOTICE_VERSION,
  categoryAllowed,
  decisionFor,
  eraseRecord,
  grantedCategories,
  hasExplicitDecision,
  loadRecord,
  persistRecord,
  recordForExport,
  withDecision,
  withDecisions,
  withdraw as withdrawInRecord,
} from '../../../lib/consent/record.js';
import { memoryStorage } from '../../../lib/consent/storage.js';

export interface ConsentManagerOptions {
  readonly storage?: ConsentStorage;
  readonly now: () => number;
  readonly noticeVersion?: string;
  /** Fired on each accepted decision, newest state first argument. */
  readonly onChange?: (record: ConsentRecord, change: ConsentChange) => void;
  /** Non-blocking complaint channel: storage failures, refused decisions. */
  readonly onDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface ConsentChange {
  readonly category: ConsentCategory;
  readonly value: DecisionValue;
  readonly reason: 'banner' | 'preference' | 'withdrawal' | 'bulk';
  readonly persisted: boolean;
}

export interface ConsentManager {
  record(): ConsentRecord;
  /** Synchronous, allocation-free, called on every event. */
  allowed(category: ConsentCategory): boolean;
  granted(): readonly ConsentCategory[];
  hasDecided(): boolean;
  /** Whether the record actually survived storage; the banner must show a different line if it is false. */
  persisted(): boolean;
  setDecision(category: ConsentCategory, value: DecisionValue, reason: ConsentChange['reason']): boolean;
  acceptAll(reason?: ConsentChange['reason']): boolean;
  refuseAll(reason?: ConsentChange['reason']): boolean;
  /** Records a refusal and reports what has to happen next (queue discard, id rotation) — see `withdraw.ts`. */
  beginWithdrawal(category: ConsentCategory): { ok: boolean; change: ConsentChange | null };
  exportRecord(): string;
  erase(): boolean;
  subscribe(listener: (record: ConsentRecord) => void): () => void;
  /** For `useSyncExternalStore`: a cached snapshot object, stable between changes. */
  snapshot(): ConsentRecord;
}

export function createConsentManager(options: ConsentManagerOptions): ConsentManager {
  const storage = options.storage ?? memoryStorage();
  const noticeVersion = options.noticeVersion ?? CONSENT_NOTICE_VERSION;

  let current = loadRecord(storage, CONSENT_STORAGE_KEY, options.now(), noticeVersion);
  let persistedOk = true;
  const listeners = new Set<(record: ConsentRecord) => void>();

  const diagnose = (message: string, detail?: Record<string, unknown>): void => {
    try {
      options.onDiagnostic?.(message, detail);
    } catch {
      /* a diagnostic hook must not break a consent action */
    }
  };

  function commit(next: ConsentRecord, change: ConsentChange | null): boolean {
    const before = current;
    current = next;
    persistedOk = persistRecord(storage, CONSENT_STORAGE_KEY, next);
    if (!persistedOk) {
      diagnose(
        'consent decision could not be written to storage: it holds for this page load only, and the buyer will be asked again next visit',
        { category: change?.category ?? null },
      );
    }
    if (change !== null) {
      try {
        options.onChange?.(next, { ...change, persisted: persistedOk });
      } catch (error) {
        // A listener that throws (the session manager, the queue seal) must not undo a decision the
        // buyer already made. The decision is the record; the reaction is a subscriber's problem.
        diagnose('consent change listener threw', { message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (before.version !== next.version) {
      for (const listener of listeners) {
        try {
          listener(next);
        } catch (error) {
          diagnose('consent subscriber threw', { message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return persistedOk;
  }

  return {
    record: () => current,
    snapshot: () => current,

    allowed(category) {
      return categoryAllowed(current, category);
    },

    granted: () => grantedCategories(current),
    hasDecided: () => hasExplicitDecision(current),
    persisted: () => persistedOk,

    setDecision(category, value, reason) {
      if (!isConsentCategory(category) || !DECISION_CATEGORIES.includes(category as (typeof DECISION_CATEGORIES)[number])) {
        diagnose(`refusing to record a decision for "${String(category)}": it is not a category a buyer can decide about`, {
          category,
          value,
        });
        return false;
      }
      if (value === 'granted' && !CONSENT_GATED.includes(category)) {
        diagnose(`refusing a granted decision for "${category}": it is not a consent-gated category`, { value });
        return false;
      }
      try {
        const next = withDecision(current, {
          category: category as (typeof DECISION_CATEGORIES)[number],
          value,
          method: reason === 'withdrawal' ? 'withdrawal' : reason === 'banner' ? (value === 'granted' ? 'banner_accept_all' : 'banner_refuse_all') : 'preferences_toggle',
          now: options.now(),
          noticeVersion,
        });
        return commit(next, { category, value, reason, persisted: true });
      } catch (error) {
        diagnose('consent decision rejected', { message: error instanceof Error ? error.message : String(error) });
        return false;
      }
    },

    acceptAll(reason = 'banner') {
      const next = withDecisions(
        current,
        CONSENT_GATED.map((c) => ({ category: c as (typeof DECISION_CATEGORIES)[number], value: 'granted' as DecisionValue })),
        'banner_accept_all',
        options.now(),
      );
      return commit(next, { category: 'measurement', value: 'granted', reason, persisted: true });
    },

    refuseAll(reason = 'banner') {
      const next = withDecisions(
        current,
        DECISION_CATEGORIES.map((c) => ({ category: c, value: 'refused' as DecisionValue })),
        'banner_refuse_all',
        options.now(),
      );
      return commit(next, { category: 'measurement', value: 'refused', reason, persisted: true });
    },

    beginWithdrawal(category) {
      if (!isConsentCategory(category) || !CONSENT_GATED.includes(category)) {
        return { ok: false, change: null };
      }
      if (decisionFor(current, category)?.value !== 'granted') return { ok: false, change: null };
      const next = withdrawInRecord(current, category as (typeof DECISION_CATEGORIES)[number], options.now());
      const persisted = commit(next, { category, value: 'refused', reason: 'withdrawal', persisted: true });
      return { ok: true, change: { category, value: 'refused', reason: 'withdrawal', persisted } };
    },

    exportRecord: () => recordForExport(current),

    erase() {
      const ok = eraseRecord(storage, CONSENT_STORAGE_KEY);
      current = loadRecord(storage, CONSENT_STORAGE_KEY, options.now(), noticeVersion);
      persistedOk = ok;
      // Erasure puts the buyer back to "never asked", which means the gate must be closed *and* the
      // queue emptied. `withdraw.ts` does the emptying; this only records that an erase happened.
      diagnose('consent record erased', { storageRemoved: ok });
      for (const listener of listeners) {
        try {
          listener(current);
        } catch {
          /* see commit */
        }
      }
      return ok;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The read path for code that cannot hold a manager (a pure function in a test, a server render):
 * never grants anything.
 */
export function deniedConsentManager(now: () => number = () => 0): ConsentManager {
  const manager = createConsentManager({ storage: memoryStorage(), now });
  return manager;
}
