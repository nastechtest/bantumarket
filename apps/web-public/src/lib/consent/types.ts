/**
 * The consent vocabulary, with no dependency on analytics.
 *
 * This lives in `src/lib/consent` rather than inside the analytics feature because the record is not
 * an analytics concern — it is the legal artefact. Auth's consent step, the account screen's
 * "download my data" action and the staff-side access request all have to read and write the same
 * record, and none of them should have to import an event catalogue to do it.
 *
 * Four categories, deliberately unequal:
 *
 *  · `essential`   — not a consent question. See `lawful-basis.ts`: it is the rotating id and the
 *                    consent ledger itself, and switching it off would mean keeping no record of
 *                    what the buyer chose, which is worse for the buyer, not better.
 *  · `quality`     — performance and 3D availability. Consent-gated, off by default.
 *  · `measurement` — the funnels 04's exit tests read. Consent-gated, off by default.
 *  · `marketing`   — declared so the *absence* is a stated position rather than an oversight, and
 *                    so a future developer has to delete a registry entry, not add one, to start
 *                    profiling buyers. Nothing may be recorded as granted for it.
 */
export const CONSENT_CATEGORIES = ['essential', 'quality', 'measurement', 'marketing'] as const;

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

export function isConsentCategory(value: unknown): value is ConsentCategory {
  return typeof value === 'string' && (CONSENT_CATEGORIES as readonly string[]).includes(value);
}

/** `essential` is never a decision: it has a lawful basis, not a consent. */
export const DECISION_CATEGORIES: readonly ConsentCategory[] = ['quality', 'measurement', 'marketing'];

/** Categories whose processing may begin only after an affirmative decision. */
export const CONSENT_GATED: readonly ConsentCategory[] = ['quality', 'measurement'];

/**
 * Categories we do not process for at all in the pilot, so a `granted` decision would be a record
 * of a permission to do something we have no basis to do. Refusing is the only legal value.
 */
export const NEVER_COLLECTED: readonly ConsentCategory[] = ['marketing'];

export function isDecisionCategory(value: unknown): value is (typeof DECISION_CATEGORIES)[number] {
  return typeof value === 'string' && (DECISION_CATEGORIES as readonly string[]).includes(value);
}

export type DecisionValue = 'granted' | 'refused';

/**
 * How a decision came to exist. POPIA s11(3)(a) requires consent to be given "voluntarily for a
 * specific purpose, after the data subject has been given adequate disclosure", and s4(d) makes the
 * responsible person able to demonstrate it — so a bare boolean is not a record. `system_default`
 * exists so "we never asked them" is visible on the record instead of being indistinguishable from
 * a quiet refusal.
 */
export const CONSENT_METHODS = [
  'banner_accept_all',
  'banner_refuse_all',
  'preferences_toggle',
  'withdrawal',
  'imported_from_v0',
  're_collected_after_change',
] as const;

export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export function isConsentMethod(value: unknown): value is ConsentMethod {
  return typeof value === 'string' && (CONSENT_METHODS as readonly string[]).includes(value);
}

export interface CategoryDecision {
  readonly category: (typeof DECISION_CATEGORIES)[number];
  readonly value: DecisionValue;
  /** Epoch ms from an injected clock — see `record.ts` on why the store never calls `Date.now`. */
  readonly decidedAt: number;
  readonly method: ConsentMethod;
  /** The notice text version this decision was taken against (s18 disclosure version). */
  readonly noticeVersion: string;
}

/**
 * The durable artefact. `version` is monotonic and every emitted event carries it, so an analyst can
 * prove which permission was in force when a row was written instead of asserting it after the fact.
 */
export interface ConsentRecord {
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly noticeVersion: string;
  /** Exactly one entry per decision category: the current state. */
  readonly decisions: readonly CategoryDecision[];
  /** Append-only evidence trail, capped by the store (POPIA s23 access requests read this). */
  readonly decisionLog: readonly CategoryDecision[];
}

export interface ConsentStorage {
  read(key: string): string | null;
  /** Never throws: private mode and a full quota are a `false`, not a crash in a buyer's face. */
  write(key: string, value: string): boolean;
  remove(key: string): void;
}

export const CONSENT_STORAGE_KEY = 'ntm.consent.v1';

/**
 * Cap on the evidence log. A log that grows without bound becomes personal information about the
 * person's decisions over months of use — which is exactly the sort of accumulation this feature is
 * being accused of avoiding. 40 entries is ~20 accept/refuse round trips; past that the oldest
 * entries roll and the current state is still complete.
 */
export const DECISION_LOG_CAP = 40;
