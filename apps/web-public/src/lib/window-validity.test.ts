import { describe, it, expect } from 'bun:test';
import {
  MAX_CLOCK_SKEW_MS,
  SAST_OFFSET_MINUTES,
  describeWindow,
  evaluateWindow,
  formatSast,
  parseServerInstant,
  remainingLabel,
  windowStatusLine,
  windowStraddlesMidnight,
} from './window-validity.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Reference instants, all expressed as SAST wall time, parsed only through the SAST reader. */
const OPEN = parseServerInstant('2026-10-08T10:00:00+02:00');
const EXPIRE = parseServerInstant('2026-10-08T16:00:00+02:00');

describe('SAST is a fixed truth, not a device setting', () => {
  it('the offset is UTC+2 and there is no DST rule to consult', () => {
    expect(SAST_OFFSET_MINUTES).toBe(120);
  });

  it('formats the same instant identically at every northern “DST” date it could touch', () => {
    // 2026-03-29 is when Europe springs forward; SAST does not move.
    const winter = formatSast(parseServerInstant('2026-03-28T20:30:00+02:00'));
    const spring = formatSast(parseServerInstant('2026-03-29T20:30:00+02:00'));
    expect(winter.time).toBe('20:30');
    expect(spring.time).toBe('20:30');
    expect(spring.date).toBe('2026-03-29');
  });

  it('a bare wall-clock string is read as SAST, not as the device’s local time', () => {
    expect(parseServerInstant('2026-10-08T18:45:00')).toBe(parseServerInstant('2026-10-08T18:45:00+02:00'));
    expect(() => parseServerInstant('not a date')).toThrow(RangeError);
  });
});

describe('evaluateWindow: before / inside / after', () => {
  it('before the window, well clear of the skew band', () => {
    const e = evaluateWindow(OPEN - 10 * MIN, OPEN, EXPIRE);
    expect(e.status).toBe('before');
    expect(e.withinSkew).toBe(false);
  });

  it('comfortably inside the window', () => {
    const e = evaluateWindow(OPEN + 5 * MIN, OPEN, EXPIRE);
    expect(e.status).toBe('open');
    expect(e.msToExpiry).toBe(EXPIRE - (OPEN + 5 * MIN));
    expect(windowStatusLine(e)).toContain('Window open');
  });

  it('after expiry, well clear of the skew band', () => {
    const e = evaluateWindow(EXPIRE + 10 * MIN, OPEN, EXPIRE);
    expect(e.status).toBe('expired');
    expect(e.msToExpiry).toBeLessThan(0);
  });
});

describe('evaluateWindow: ±90 s server-clock skew', () => {
  it('60 s before expiry is edge/closing, not a confident “open”', () => {
    const e = evaluateWindow(EXPIRE - 60_000, OPEN, EXPIRE);
    expect(e.status).toBe('edge');
    expect(e.edge).toBe('closing');
    expect(e.withinSkew).toBe(true);
  });

  it('60 s after expiry is still edge — the server, not this phone, declares it closed', () => {
    const e = evaluateWindow(EXPIRE + 60_000, OPEN, EXPIRE);
    expect(e.status).toBe('edge');
    expect(e.edge).toBe('closing');
  });

  it('90 s is the tolerance and 91 s past expiry is expired', () => {
    expect(evaluateWindow(EXPIRE - MAX_CLOCK_SKEW_MS, OPEN, EXPIRE).status).toBe('edge');
    expect(evaluateWindow(EXPIRE + MAX_CLOCK_SKEW_MS, OPEN, EXPIRE).status).toBe('edge');
    expect(evaluateWindow(EXPIRE + MAX_CLOCK_SKEW_MS + 1_000, OPEN, EXPIRE).status).toBe('expired');
  });

  it('the opening edge is symmetric: 30 s early is edge/opening, 2 min early is before', () => {
    expect(evaluateWindow(OPEN - 30_000, OPEN, EXPIRE).edge).toBe('opening');
    expect(evaluateWindow(OPEN - 2 * MIN, OPEN, EXPIRE).status).toBe('before');
  });

  it('the edge copy refuses to promise the client more than it knows', () => {
    const line = windowStatusLine(evaluateWindow(EXPIRE - 30_000, OPEN, EXPIRE));
    expect(line.toLowerCase()).toContain('server');
  });
});

describe('a client clock set to another zone cannot shift a deadline', () => {
  it('the module survives a environment whose LOCAL Date getters throw', () => {
    const proto = Date.prototype;
    const saved = new Map<string, PropertyDescriptor>();
    const names = ['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getSeconds', 'getTimezoneOffset', 'toString', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'] as const;
    const boom = () => {
      throw new Error('local timezone leak: a money deadline read the device zone');
    };
    for (const n of names) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, n);
      if (descriptor === undefined) throw new Error(`Date.prototype.${n} is not there to poison — this test no longer tests anything`);
      saved.set(n, descriptor);
      (proto as unknown as Record<string, unknown>)[n] = boom;
    }
    try {
      // All of the window machinery must run on epoch maths + UTC getters only.
      const view = describeWindow(OPEN + HOUR, '2026-10-08T10:00:00+02:00', '2026-10-08T16:00:00+02:00');
      expect(view.evaluation.status).toBe('open');
      expect(view.expires.label).toContain('SAST');
      expect(remainingLabel(view.evaluation.msToExpiry)).toBe('5 h left');
    } finally {
      for (const [n, descriptor] of saved) {
        Object.defineProperty(proto, n, descriptor);
      }
    }
  });

  it('the same instant expressed from a far-off zone formats to identical SAST', () => {
    // 18:45 SAST is 16:45 Zulu and 09:45 PDT — one instant, one rendering.
    const zulu = parseServerInstant('2026-10-08T18:45:00+02:00');
    expect(zulu).toBe(Date.parse('2026-10-08T16:45:00Z'));
    expect(formatSast(zulu).time).toBe('18:45');
    expect(formatSast(zulu).date).toBe('2026-10-08');
  });
});

describe('a window that straddles midnight SAST', () => {
  const lateOpen = parseServerInstant('2026-04-30T23:30:00+02:00');
  const earlyExpire = parseServerInstant('2026-05-01T00:20:00+02:00');

  it('counts remaining time across the date line in exact milliseconds', () => {
    const at2350 = parseServerInstant('2026-04-30T23:50:00+02:00');
    const e = evaluateWindow(at2350, lateOpen, earlyExpire);
    expect(e.status).toBe('open');
    // 23:50 → 00:20 is 30 minutes across the date line.
    expect(e.msToExpiry).toBe(30 * MIN);
    expect(remainingLabel(e.msToExpiry)).toBe('30 min left');
  });

  it('reports the two different SAST dates instead of pretending it is one evening', () => {
    expect(windowStraddlesMidnight(lateOpen, earlyExpire)).toBe(true);
    const view = describeWindow(parseServerInstant('2026-04-30T23:40:00+02:00'), '2026-04-30T23:30:00+02:00', '2026-05-01T00:20:00+02:00');
    expect(view.opens.date).toBe('2026-04-30');
    expect(view.expires.date).toBe('2026-05-01');
    expect(view.crossesToNextDay).toBe(true);
  });

  it('rejects a window that runs backwards instead of guessing', () => {
    expect(() => evaluateWindow(earlyExpire, earlyExpire, lateOpen)).toThrow(RangeError);
  });
});

describe('remainingLabel', () => {
  it('speaks in the units a person at a meeting point can use', () => {
    expect(remainingLabel(45 * MIN)).toBe('45 min left');
    expect(remainingLabel(65 * MIN)).toBe('1 h 5 min left');
    expect(remainingLabel(4 * HOUR)).toBe('4 h left');
    expect(remainingLabel(26 * HOUR)).toBe('1 d 2 h left');
    expect(remainingLabel(0)).toBe('the window has closed');
  });
});
