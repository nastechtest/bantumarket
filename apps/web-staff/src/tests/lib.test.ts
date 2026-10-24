import { describe, expect, it } from 'bun:test';
import {
  DENIED_MESSAGE,
  OFFLINE_MESSAGE,
  classifyStatus,
  isDenied,
  offlineFailure,
  parseRetryAfter,
} from '../lib/api.js';
import {
  PAGE_SIZES,
  readDensity,
  readPageSize,
  toggleDensity,
  writeDensity,
  writePageSize,
} from '../lib/table-prefs.js';
import type { PreferenceStorage } from '../lib/table-prefs.js';
import { deleteView, isSafeViewHref, listViews, saveView } from '../layout/saved-views.js';

function memoryStorage(seed: Record<string, string> = {}): PreferenceStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const throwingStorage: PreferenceStorage = {
  getItem() {
    throw new Error('denied by privacy mode');
  },
  setItem() {
    throw new Error('quota');
  },
};

describe('transport failure classification', () => {
  it('collapses 401, 403 and 404 into one indistinguishable refusal', () => {
    const failures = [401, 403, 404].map((status) => classifyStatus(status));
    const outcomes = failures.map(({ kind, message, retryAfterSeconds }) => ({ kind, message, retryAfterSeconds }));
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[1]).toEqual(outcomes[2]);
    expect(outcomes[0]?.kind).toBe('denied');
    expect(outcomes[0]?.message).toBe(DENIED_MESSAGE);
    expect(failures.every(isDenied)).toBe(true);
    expect(classifyStatus(500)).not.toEqual(failures[0]);
    expect(isDenied(classifyStatus(500))).toBe(false);
  });

  it('classifies throttling without leaking a record', () => {
    const failure = classifyStatus(429, '120');
    expect(failure.kind).toBe('rate-limited');
    expect(failure.retryAfterSeconds).toBe(120);
    expect(failure.message).toContain('120 seconds');
    expect(classifyStatus(429).retryAfterSeconds).toBeNull();
  });

  it('parses both Retry-After forms and rejects garbage', () => {
    expect(parseRetryAfter('45')).toBe(45);
    expect(parseRetryAfter(' 45 ')).toBe(45);
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('later')).toBeNull();
    const at = new Date(Date.now() + 90_000).toUTCString();
    const seconds = parseRetryAfter(at);
    expect(seconds).not.toBeNull();
    expect(seconds!).toBeGreaterThanOrEqual(88);
    expect(seconds!).toBeLessThanOrEqual(90);
  });

  it('reports offline as its own kind with no status', () => {
    const failure = offlineFailure();
    expect(failure.kind).toBe('offline');
    expect(failure.status).toBeNull();
    expect(failure.message).toBe(OFFLINE_MESSAGE);
    expect(isDenied(failure)).toBe(false);
  });
});

describe('table preferences', () => {
  it('defaults to comfortable rows and 25 rows per page', () => {
    const storage = memoryStorage();
    expect(readDensity(storage)).toBe('comfortable');
    expect(readPageSize(storage)).toBe(PAGE_SIZES[0]);
    expect(toggleDensity('comfortable')).toBe('compact');
    expect(toggleDensity('compact')).toBe('comfortable');
  });

  it('persists density and page size through the injected storage', () => {
    const storage = memoryStorage();
    writeDensity('compact', storage);
    expect(readDensity(storage)).toBe('compact');
    writePageSize(50, storage);
    expect(readPageSize(storage)).toBe(50);
    expect(storage.data.get('nastech.staff.page-size.v1')).toBe('50');
  });

  it('ignores an out-of-range stored page size instead of trusting it', () => {
    expect(readPageSize(memoryStorage({ 'nastech.staff.page-size.v1': '10000' }))).toBe(25);
    expect(readPageSize(memoryStorage({ 'nastech.staff.page-size.v1': 'nonsense' }))).toBe(25);
  });

  it('survives a storage that throws on read and write', () => {
    expect(readDensity(throwingStorage)).toBe('comfortable');
    expect(readPageSize(throwingStorage)).toBe(25);
    expect(() => writeDensity('compact', throwingStorage)).not.toThrow();
    expect(() => writePageSize(50, throwingStorage)).not.toThrow();
    expect(readDensity(null)).toBe('comfortable');
  });
});

describe('saved table views', () => {
  it('accepts only same-origin console paths', () => {
    expect(isSafeViewHref('/disputes?state=open')).toBe(true);
    expect(isSafeViewHref('/')).toBe(true);
    expect(isSafeViewHref('https://example.test/disputes')).toBe(false);
    expect(isSafeViewHref('//example.test/disputes')).toBe(false);
    expect(isSafeViewHref('/\\example.test')).toBe(false);
    expect(isSafeViewHref('javascript:alert(1)')).toBe(false);
    expect(isSafeViewHref('disputes')).toBe(false);
  });

  it('saves, lists and deletes a view for one staff member and table', () => {
    const storage = memoryStorage();
    const saved = saveView('staff_naledi', 'disputes', 'Open disputes', '/disputes?state=open', storage);
    expect(saved.map((view) => view.name)).toEqual(['Open disputes']);
    expect(listViews('staff_naledi', 'disputes', storage)).toEqual(saved);
    expect(listViews('staff_other', 'disputes', storage)).toEqual([]);
    expect(listViews('staff_naledi', 'payouts', storage)).toEqual([]);

    const afterDelete = deleteView('staff_naledi', 'disputes', saved[0]!.id, storage);
    expect(afterDelete).toEqual([]);
    expect(listViews('staff_naledi', 'disputes', storage)).toEqual([]);
  });

  it('updates a view with the same name instead of duplicating it', () => {
    const storage = memoryStorage();
    saveView('staff_naledi', 'disputes', 'Open', '/disputes?state=open', storage);
    const views = saveView('staff_naledi', 'disputes', 'open', '/disputes?state=open&sort=age', storage);
    expect(views.length).toBe(1);
    expect(views[0]?.href).toBe('/disputes?state=open&sort=age');
  });

  it('refuses an unsafe current href and writes nothing', () => {
    const storage = memoryStorage();
    expect(saveView('staff_naledi', 'disputes', 'Bad', 'https://example.test', storage)).toEqual([]);
    expect(storage.data.size).toBe(0);
  });

  it('bounds a table to its eight most recent views', () => {
    const storage = memoryStorage();
    for (let index = 0; index < 10; index += 1) {
      saveView('staff_naledi', 'disputes', `View ${index}`, `/disputes?page=${index}`, storage);
    }
    const views = listViews('staff_naledi', 'disputes', storage);
    expect(views.length).toBe(8);
    expect(views[0]?.name).toBe('View 2');
    expect(views[7]?.name).toBe('View 9');
  });

  it('discards malformed stored data rather than rendering it', () => {
    const storage = memoryStorage({ 'nastech.staff.saved-views.v1': '{not json' });
    expect(listViews('staff_naledi', 'disputes', storage)).toEqual([]);
    const poisoned = memoryStorage({
      'nastech.staff.saved-views.v1': JSON.stringify({
        'staff_naledi::disputes': [
          { id: 'a', name: 'Evil', href: 'https://example.test' },
          { id: 'b', name: '', href: '/disputes' },
          { id: 'c', name: 'Fine', href: '/disputes?state=open' },
        ],
      }),
    });
    expect(listViews('staff_naledi', 'disputes', poisoned).map((view) => view.name)).toEqual(['Fine']);
  });
});
