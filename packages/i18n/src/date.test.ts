/**
 * SAST date formatting. The behaviour worth pinning is that a wall-clock reading comes out the same
 * no matter the host process's timezone — the value is always derived by shifting the UTC instant by a
 * fixed +2h and reading UTC getters, never by `toLocaleString()` under `TZ`. And a legal timestamp
 * carries its own `+02:00` offset so it is unambiguous wherever it is read.
 */

import { describe, it, expect } from 'bun:test';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { formatDate, formatDateTime, formatLegalTimestamp, formatWeekday, SAST_OFFSET_MINUTES } from './formatter/date.js';

/** Host-local hour at load, so the timezone test can prove it did not change the process. */
const HOST_HOUR_AT_LOAD = new Date(Date.UTC(2026, 0, 1, 22, 0, 0)).getHours();

describe('SAST offset', () => {
  it('is a fixed +2h with no DST', () => {
    expect(SAST_OFFSET_MINUTES).toBe(120);
  });
});

describe('formatLegalTimestamp', () => {
  it('renders a UTC instant as SAST with an explicit +02:00 offset', () => {
    const utc = Date.UTC(2026, 9, 12, 12, 5, 0); // 2026-10-12T12:05:00Z
    expect(formatLegalTimestamp(utc)).toBe('2026-10-12T14:05:00+02:00');
  });

  it('crosses into the next SAST day at 22:00 UTC (UTC+2 rolls the date forward)', () => {
    const utc = Date.UTC(2026, 9, 12, 23, 30, 0); // 2026-10-12T23:30:00Z → 13 Oct 01:30 SAST
    expect(formatLegalTimestamp(utc)).toBe('2026-10-13T01:30:00+02:00');
    expect(formatDate(utc, 'en', 'long')).toBe('13 October 2026');
  });

  it('honours the input’s own offset (an ISO string with +02:00 is already SAST)', () => {
    expect(formatLegalTimestamp('2026-10-13T00:30:00+02:00')).toBe('2026-10-13T00:30:00+02:00');
  });

  it('is independent of the host timezone for the same instant', () => {
    // The claim is about the *host process*, so it has to be tested in another process. Writing
    // `process.env.TZ` here is not a usable probe: `bun test` runs every file in one process, the
    // zone is cached on first use, and clearing the variable afterwards does not give the original
    // zone back — the leaked value flipped a seller dashboard greeting in an unrelated suite.
    const utc = Date.UTC(2026, 0, 1, 22, 0, 0); // 22:00Z → 00:00 SAST next day (2 Jan)
    const here = formatLegalTimestamp(utc);
    const zone = 'America/Sao_Paulo'; // UTC-3: a local read of this instant lands on 12:00, not 00:00

    const child = spawnSync(
      process.execPath,
      ['-e', 'const m = await import(process.argv[1]); process.stdout.write(m.formatLegalTimestamp(Number(process.argv[2])));',
       join(import.meta.dir, 'formatter/date.js'), String(utc)],
      { env: { ...process.env, TZ: zone }, encoding: 'utf8' },
    );
    expect(child.status).toBe(0);
    expect(child.stderr).toBe('');
    expect(child.stdout).toBe('2026-01-02T00:00:00+02:00');
    expect(child.stdout).toBe(here);
    // And the probe must be non-destructive: whatever this process's zone was, it still is.
    expect(new Date(utc).getHours()).toBe(HOST_HOUR_AT_LOAD);
  });
});

describe('formatDate / formatDateTime', () => {
  const utc = Date.UTC(2026, 9, 12, 10, 15, 0); // 2026-10-12T10:15:00Z → 12:15 SAST

  it('English long and short forms', () => {
    expect(formatDate(utc, 'en', 'long')).toBe('12 October 2026');
    expect(formatDate(utc, 'en', 'short')).toBe('12 Okt 2026');
  });

  it('Afrikaans long form uses Afrikaans month names', () => {
    expect(formatDate(utc, 'af', 'long')).toBe('12 Oktober 2026');
  });

  it('isiZulu / isiXhosa fall back to a numeric date rather than fabricating month names', () => {
    expect(formatDate(utc, 'zu')).toBe('12/10/2026');
    expect(formatDate(utc, 'xh')).toBe('12/10/2026');
  });

  it('formatDateTime appends the 24-hour SAST clock', () => {
    expect(formatDateTime(utc, 'en')).toBe('12 October 2026, 12:15');
  });

  it('formatWeekday names the day in each language we assert, numeric date otherwise', () => {
    // 2026-10-12 is a Monday.
    expect(formatWeekday(utc, 'en')).toBe('Monday');
    expect(formatWeekday(utc, 'af')).toBe('Maandag');
    expect(formatWeekday(utc, 'zu')).toBe('uMsombuluko');
  });

  it('throws on unparseable input instead of rendering "NaN"', () => {
    expect(() => formatDate('not a date', 'en')).toThrow(TypeError);
    expect(() => formatDate(Number.NaN, 'en')).toThrow(TypeError);
  });
});
