import { describe, expect, it } from 'bun:test';
import {
  computeProgress,
  declaredBytes,
  formatBytes,
  progressFromResponse,
  trackProgress,
  type LoadProgress,
} from './progress.js';

const MB = 1024 * 1024;

describe('computeProgress', () => {
  it('reports a real percentage against the declared total', () => {
    const p = computeProgress(1_250_000, 2_500_000);
    expect(p.percent).toBe(50);
    expect(p.indeterminate).toBe(false);
    expect(p.totalBytes).toBe(2_500_000);
  });

  it('counts bytes, not a tick counter pretending to be progress', () => {
    const first = computeProgress(100_000, 1_000_000);
    const next = computeProgress(200_000, 1_000_000);
    expect(first.percent).toBe(10);
    expect(next.percent).toBe(20);
    expect(next.receivedBytes).toBe(200_000);
  });

  it('degrades to indeterminate when nobody declared a size', () => {
    const p = computeProgress(64_000, null);
    expect(p.indeterminate).toBe(true);
    expect(p.percent).toBeNull();
    expect(p.totalBytes).toBeNull();
  });

  it('says the size is unknown in the accessible text, not just visually', () => {
    // formatBytes speaks in binary units, so 64 KB means 65_536 bytes; a decimal 64_000 is 63 KB.
    expect(computeProgress(65_536, null).ariaValueText).toContain('total size unknown');
    expect(computeProgress(65_536, null).ariaValueText).toContain('64 KB');
  });

  it('reads the percentage back to a screen reader with both numbers', () => {
    const text = computeProgress(1 * MB, 4 * MB).ariaValueText;
    expect(text).toContain('1.0 MB');
    expect(text).toContain('4.0 MB');
    expect(text).toContain('25%');
  });

  it('never claims more than 100% when the wire overshoots the declared size', () => {
    // gzip means the transferred bytes and Content-Length can disagree; a 118% bar is a lie.
    const p = computeProgress(3 * MB, 2 * MB);
    expect(p.percent).toBe(100);
    expect(p.receivedBytes).toBe(3 * MB);
  });

  it('treats a zero or nonsense denominator as unknown rather than dividing by it', () => {
    for (const total of [0, -1, Number.NaN]) {
      const p = computeProgress(500, total);
      expect(p.indeterminate).toBe(true);
      expect(p.percent).toBeNull();
    }
  });

  it('clamps negative arrivals instead of showing minus twelve percent', () => {
    expect(computeProgress(-5_000, 10_000).percent).toBe(0);
    expect(computeProgress(Number.NaN, 10_000).receivedBytes).toBe(0);
  });
});

describe('declaredBytes', () => {
  it('accepts a genuine Content-Length', () => {
    expect(declaredBytes('1048576')).toBe(1_048_576);
  });

  it('rejects an absent or dishonest one', () => {
    expect(declaredBytes(null)).toBeNull();
    expect(declaredBytes(undefined)).toBeNull();
    expect(declaredBytes('')).toBeNull();
    expect(declaredBytes('chunked')).toBeNull();
    expect(declaredBytes('0')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('uses the units a buyer reads on a metered connection', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(64 * 1024)).toBe('64 KB');
    expect(formatBytes(2.5 * MB)).toBe('2.5 MB');
    expect(formatBytes(0)).toBe('0 KB');
  });
});

describe('trackProgress', () => {
  it('emits an indeterminate frame first, then real arrivals', async () => {
    const frames: LoadProgress[] = [];
    const final = await trackProgress((p) => frames.push(p), 3_000, {
      read: async (onChunk) => {
        onChunk(1_000);
        onChunk(2_000);
      },
    });
    expect(frames[0]!.percent).toBe(0);
    expect(frames[1]!.percent).toBe(33);
    expect(final.percent).toBe(100);
    expect(final.receivedBytes).toBe(3_000);
  });

  it('counts only what arrived when the stream stops short', async () => {
    const frames: LoadProgress[] = [];
    const final = await trackProgress((p) => frames.push(p), 4_000, {
      // A truncated transfer: the reader finished without ever delivering the rest.
      read: async (onChunk) => onChunk(1_000),
    });
    expect(final.percent).toBe(25);
    expect(final.receivedBytes).toBe(1_000);
  });

  it('ignores bytes delivered after the buyer left', async () => {
    const controller = new AbortController();
    const frames: LoadProgress[] = [];
    controller.abort();
    const final = await trackProgress((p) => frames.push(p), 2_000, {
      signal: controller.signal,
      read: async (onChunk) => {
        onChunk(1_000);
        onChunk(1_000);
      },
    });
    expect(final.receivedBytes).toBe(0);
  });
});

describe('progressFromResponse', () => {
  function fakeResponse(chunks: number[], headers: Record<string, string> = {}) {
    let i = 0;
    return {
      body: {
        getReader: () => ({
          read: async () =>
            i < chunks.length
              ? { done: false, value: { byteLength: chunks[i++]! } }
              : { done: true, value: undefined },
          cancel: () => {},
        }),
      },
      headers: { get: (name: string) => headers[name] ?? null },
    };
  }

  it('prefers the manifest’s declared size over the header', async () => {
    const seen: LoadProgress[] = [];
    const final = await progressFromResponse(fakeResponse([500_000], { 'Content-Length': '900000' }), 2_000_000, (p) => seen.push(p));
    expect(final.percent).toBe(25);
    expect(final.totalBytes).toBe(2_000_000);
  });

  it('falls back to Content-Length when the manifest was silent', async () => {
    const final = await progressFromResponse(fakeResponse([250_000], { 'Content-Length': '1000000' }), null, () => {});
    expect(final.percent).toBe(25);
    expect(final.indeterminate).toBe(false);
  });

  it('stays indeterminate when both are missing, and does not invent a bar', async () => {
    const final = await progressFromResponse(fakeResponse([250_000]), null, () => {});
    expect(final.indeterminate).toBe(true);
    expect(final.percent).toBeNull();
    expect(final.receivedBytes).toBe(250_000);
  });

  it('cancels the reader when the abort fires mid-stream', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const response = {
      body: {
        getReader: () => ({
          read: async () => {
            controller.abort();
            return { done: false, value: { byteLength: 10 } };
          },
          cancel: () => {
            cancelled = true;
          },
        }),
      },
      headers: { get: () => null },
    };
    await progressFromResponse(response, 1_000, () => {}, { signal: controller.signal });
    expect(cancelled).toBe(true);
  });
});
