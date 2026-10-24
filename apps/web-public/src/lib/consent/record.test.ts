import { describe, expect, test } from 'bun:test';
import {
  CONSENT_NOTICE_VERSION,
  ConsentRecordError,
  categoryAllowed,
  decisionFor,
  eraseRecord,
  grantedCategories,
  hasExplicitDecision,
  initialRecord,
  loadRecord,
  parseRecord,
  persistRecord,
  serialiseRecord,
  withDecision,
  withDecisions,
  withdraw,
} from './record.js';
import { memoryStorage, unavailableStorage, webStorage } from './storage.js';
import { CONSENT_STORAGE_KEY } from './types.js';
import type { ConsentRecord } from './types.js';

const T0 = 1_770_000_000_000;

/** A record with one explicit choice, the shape every test below starts from. */
function decided(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  const base = withDecisions(
    initialRecord(T0),
    [
      { category: 'quality', value: 'granted' },
      { category: 'measurement', value: 'refused' },
      { category: 'marketing', value: 'refused' },
    ],
    'banner_accept_all',
    T0 + 1000,
  );
  return { ...base, ...overrides };
}

describe('deny by default', () => {
  test('the starting record grants nothing, including essential-adjacent categories', () => {
    const r = initialRecord(T0);
    expect(r.version).toBe(0);
    expect(r.decisions).toHaveLength(0);
    expect(categoryAllowed(r, 'quality')).toBe(false);
    expect(categoryAllowed(r, 'measurement')).toBe(false);
    expect(categoryAllowed(r, 'marketing')).toBe(false);
  });

  test('`essential` is allowed by basis, not by consent — and no version bump can change that', () => {
    const r = initialRecord(T0);
    expect(categoryAllowed(r, 'essential')).toBe(true);
    expect(() => withDecision(r, { category: 'essential' as never, value: 'refused', method: 'preferences_toggle', now: T0 }))
      .toThrow(ConsentRecordError);
  });

  test('an absent storage read yields the denying record, not an error', () => {
    const r = loadRecord(memoryStorage(), CONSENT_STORAGE_KEY, T0);
    expect(r).toEqual(initialRecord(T0));
    expect(grantedCategories(r)).toEqual([]);
  });

  test('a storage that throws on read yields the denying record', () => {
    const hostile = {
      read(): string | null {
        throw new Error('SecurityError: localStorage is disabled');
      },
      write(): boolean {
        throw new Error('QuotaExceededError');
      },
      remove(): void {
        throw new Error('nope');
      },
    };
    expect(categoryAllowed(loadRecord(hostile, CONSENT_STORAGE_KEY, T0), 'measurement')).toBe(false);
    expect(persistRecord(hostile, CONSENT_STORAGE_KEY, initialRecord(T0))).toBe(false);
  });

  test('hasExplicitDecision distinguishes "never asked" from "asked and refused"', () => {
    expect(hasExplicitDecision(initialRecord(T0))).toBe(false);
    expect(hasExplicitDecision(decided())).toBe(true);
    // A half-answered record is not an answer: the banner has to come back rather than assume.
    const partial = withDecision(initialRecord(T0), { category: 'quality', value: 'granted', method: 'preferences_toggle', now: T0 });
    expect(hasExplicitDecision(partial)).toBe(false);
  });
});

describe('the record cannot lie', () => {
  test('granted for a category we never collect is refused with a message that says why', () => {
    let message = '';
    try {
      withDecision(initialRecord(T0), { category: 'marketing', value: 'granted', method: 'banner_accept_all', now: T0 });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/do not process for it/);
  });

  test('refused for marketing is allowed — declining a purpose we do not have is legal to record', () => {
    const r = withDecision(initialRecord(T0), { category: 'marketing', value: 'refused', method: 'banner_refuse_all', now: T0 });
    expect(decisionFor(r, 'marketing')?.value).toBe('refused');
  });

  test('an unknown category cannot be written', () => {
    expect(() =>
      withDecision(initialRecord(T0), { category: 'behavioural_profiling' as never, value: 'granted', method: 'preferences_toggle', now: T0 }),
    ).toThrow(/unknown category/);
  });

  test('a timestamp that is not a finite non-negative number is refused', () => {
    expect(() =>
      withDecision(initialRecord(T0), { category: 'quality', value: 'granted', method: 'preferences_toggle', now: Number.NaN }),
    ).toThrow(/non-negative finite/);
  });
});

describe('versioning and the evidence trail', () => {
  test('each decision bumps the version and appends to the log without dropping the old entry', () => {
    let r = initialRecord(T0);
    r = withDecision(r, { category: 'quality', value: 'granted', method: 'banner_accept_all', now: T0 + 1 });
    r = withDecision(r, { category: 'measurement', value: 'granted', method: 'preferences_toggle', now: T0 + 2 });
    r = withdraw(r, 'measurement', T0 + 3);

    expect(r.version).toBe(3);
    expect(r.decisions).toHaveLength(2);
    expect(r.decisionLog.map((d) => [d.category, d.value, d.method])).toEqual([
      ['quality', 'granted', 'banner_accept_all'],
      ['measurement', 'granted', 'preferences_toggle'],
      ['measurement', 'refused', 'withdrawal'],
    ]);
    // The current state says refused; the log still shows they once said yes. Both are true.
    expect(categoryAllowed(r, 'measurement')).toBe(false);
  });

  test('withdrawal is visible as a withdrawal, not folded into a plain refusal', () => {
    const r = withdraw(decided(), 'quality', T0 + 5000);
    expect(decisionFor(r, 'quality')?.method).toBe('withdrawal');
    expect(decisionFor(r, 'quality')?.value).toBe('refused');
  });

  test('the log is capped, so months of toggling cannot become a dossier', () => {
    let r = initialRecord(T0);
    for (let i = 0; i < 200; i++) {
      r = withDecision(r, { category: i % 2 === 0 ? 'quality' : 'measurement', value: i % 3 === 0 ? 'granted' : 'refused', method: 'preferences_toggle', now: T0 + i });
    }
    expect(r.decisionLog.length).toBeLessThanOrEqual(40);
    expect(r.decisionLog[r.decisionLog.length - 1]?.decidedAt).toBe(T0 + 199);
    expect(r.decisions).toHaveLength(2);
  });

  test('current decisions are stored in registry order, so toggling order cannot change the state', () => {
    const a = withDecisions(initialRecord(T0), [{ category: 'marketing', value: 'refused' }, { category: 'quality', value: 'granted' }], 'preferences_toggle', T0);
    const b = withDecisions(initialRecord(T0), [{ category: 'quality', value: 'granted' }, { category: 'marketing', value: 'refused' }], 'preferences_toggle', T0);
    expect(a.decisions).toEqual(b.decisions);
    expect(a.decisions.map((d) => d.category)).toEqual(['quality', 'marketing']);
    // The log keeps the order the decisions actually happened in — that is the evidence, not noise.
    expect(a.decisionLog.map((d) => d.category)).toEqual(['marketing', 'quality']);
    expect(b.decisionLog.map((d) => d.category)).toEqual(['quality', 'marketing']);
  });
});

describe('parse defensively: no corrupt blob may grant anything', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['truncated json', '{"version":2,"decisions":'],
    ['not an object', '"yes"'],
    ['array', '[]'],
    ['negative version', '{"version":-1,"createdAt":1,"updatedAt":1,"noticeVersion":"v","decisions":[],"decisionLog":[]}'],
    ['float version', '{"version":1.5,"createdAt":1,"updatedAt":1,"noticeVersion":"v","decisions":[],"decisionLog":[]}'],
    ['missing notice version', '{"version":1,"createdAt":1,"updatedAt":1,"decisions":[],"decisionLog":[]}'],
    ['invented category', '{"version":1,"createdAt":1,"updatedAt":1,"noticeVersion":"v","decisions":[{"category":"shadow","value":"granted","decidedAt":1,"method":"preferences_toggle","noticeVersion":"v"}],"decisionLog":[]}'],
    ['duplicate category', '{"version":1,"createdAt":1,"updatedAt":1,"noticeVersion":"v","decisions":[{"category":"quality","value":"granted","decidedAt":1,"method":"preferences_toggle","noticeVersion":"v"},{"category":"quality","value":"granted","decidedAt":2,"method":"preferences_toggle","noticeVersion":"v"}],"decisionLog":[]}'],
    ['marketing granted', '{"version":1,"createdAt":1,"updatedAt":1,"noticeVersion":"v","decisions":[{"category":"marketing","value":"granted","decidedAt":1,"method":"preferences_toggle","noticeVersion":"v"}],"decisionLog":[]}'],
    ['bad method', '{"version":1,"createdAt":1,"updatedAt":1,"noticeVersion":"v","decisions":[{"category":"quality","value":"granted","decidedAt":1,"method":"guessed_by_ua","noticeVersion":"v"}],"decisionLog":[]}'],
  ];

  for (const [label, raw] of cases) {
    test(`${label} → no record, so the caller denies`, () => {
      expect(parseRecord(raw)).toBeNull();
      const store = memoryStorage({ [CONSENT_STORAGE_KEY]: raw });
      expect(categoryAllowed(loadRecord(store, CONSENT_STORAGE_KEY, T0), 'quality')).toBe(false);
    });
  }

  test('a valid record survives a round trip and keeps its granted set', () => {
    const r = decided();
    const store = memoryStorage();
    expect(persistRecord(store, CONSENT_STORAGE_KEY, r)).toBe(true);
    const back = loadRecord(store, CONSENT_STORAGE_KEY, T0 + 999);
    expect(back).toEqual(r);
    expect(grantedCategories(back)).toEqual(['quality']);
  });

  test('a record written against an older notice is kept, re-stamped, and stays refused where it was refused', () => {
    const stale = { ...decided(), noticeVersion: 'popia-notice-2025-11' };
    const store = memoryStorage({ [CONSENT_STORAGE_KEY]: serialiseRecord(stale) });
    const loaded = loadRecord(store, CONSENT_STORAGE_KEY, T0, CONSENT_NOTICE_VERSION);
    expect(loaded.noticeVersion).toBe(CONSENT_NOTICE_VERSION);
    expect(loaded.version).toBe(stale.version);
    expect(categoryAllowed(loaded, 'quality')).toBe(true);
    expect(categoryAllowed(loaded, 'measurement')).toBe(false);
    expect(hasExplicitDecision(loaded)).toBe(true);
  });
});

describe('storage adapters', () => {
  test('memoryStorage reports a successful write, and dumps what it holds', () => {
    const s = memoryStorage();
    expect(s.read('nothing')).toBeNull();
    expect(s.write('k', 'v')).toBe(true);
    expect(s.dump()).toEqual({ k: 'v' });
    s.remove('k');
    expect(s.read('k')).toBeNull();
  });

  test('unavailableStorage never grants and never throws', () => {
    const s = unavailableStorage();
    expect(s.read('k')).toBeNull();
    expect(s.write('k', 'v')).toBe(false);
    expect(() => s.remove('k')).not.toThrow();
  });

  test('webStorage without a window reads null and writes false instead of crashing the render', () => {
    const s = webStorage({ scope: 'local', getWindow: () => null });
    expect(s.read(CONSENT_STORAGE_KEY)).toBeNull();
    expect(s.write(CONSENT_STORAGE_KEY, '{}')).toBe(false);
    expect(() => s.remove(CONSENT_STORAGE_KEY)).not.toThrow();
  });

  test('webStorage probes the store and survives a getter that throws on access', () => {
    const boomWindow = {
      get localStorage(): never {
        throw new Error('blocked by a browser extension');
      },
    } as unknown as Window & typeof globalThis;
    const s = webStorage({ scope: 'local', getWindow: () => boomWindow });
    expect(s.read(CONSENT_STORAGE_KEY)).toBeNull();
    expect(s.write(CONSENT_STORAGE_KEY, 'x')).toBe(false);
  });

  test('webStorage round-trips through a real Storage-shaped fake', () => {
    const map = new Map<string, string>();
    const fake: Storage = {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    };
    const win = { localStorage: fake } as unknown as Window & typeof globalThis;
    const s = webStorage({ scope: 'local', getWindow: () => win });
    const r = decided();
    expect(s.write(CONSENT_STORAGE_KEY, serialiseRecord(r))).toBe(true);
    expect(loadRecord(s, CONSENT_STORAGE_KEY, T0)).toEqual(r);
    // The probe write must not leave a key behind in a real browser.
    expect([...map.keys()]).toEqual([CONSENT_STORAGE_KEY]);
  });
});

describe('deletion', () => {
  test('erase removes the record and the next load denies', () => {
    const store = memoryStorage();
    persistRecord(store, CONSENT_STORAGE_KEY, decided());
    expect(eraseRecord(store, CONSENT_STORAGE_KEY)).toBe(true);
    expect(store.read(CONSENT_STORAGE_KEY)).toBeNull();
    expect(categoryAllowed(loadRecord(store, CONSENT_STORAGE_KEY, T0), 'quality')).toBe(false);
  });
});
