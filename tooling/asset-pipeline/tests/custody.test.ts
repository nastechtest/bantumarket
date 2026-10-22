import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CaptureError } from '../errors.js';
import { CustodyLog, GENESIS_HASH, openCustodyLog, type CustodyRecord } from '../custody.js';

const T0 = '2026-04-01T08:00:00.000Z';
const later = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

/** Open a job and push it as far as a test needs it. */
function logWithJob(jobId = 'job_custody_1'): CustodyLog {
  const log = new CustodyLog();
  log.append({ jobId, from: null, to: 'intake', actor: 'officer_nomsa', at: T0, evidence: 'item=itm_1;price=420000' });
  log.append({ jobId, from: 'intake', to: 'captured', actor: 'tech_lutho', at: later(10), evidence: 'session=/studio/s1;frames=48' });
  return log;
}

function tempCustodyFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'custody-')), 'custody.jsonl');
}

function rowJson(row: CustodyRecord): string {
  return `${JSON.stringify({
    sequence: row.sequence,
    job_id: row.jobId,
    from_state: row.from,
    to_state: row.to,
    actor: row.actor,
    at: row.at,
    evidence: row.evidence,
    prev_hash: row.prevHash,
    hash: row.hash,
  })}\n`;
}

describe('chain of custody', () => {
  test('the API has no mutation path at all', () => {
    const members = Object.getOwnPropertyNames(CustodyLog.prototype).filter((name) => name !== 'constructor');
    const mutators = members.filter((name) => /update|delete|remove|edit|modify|set|truncate|clear|replace|revert|prune|wipe/i.test(name));
    expect(mutators).toEqual([]);
    expect(members.sort()).toEqual(['append', 'lastState', 'length', 'records', 'verify', 'verifyOrThrow'].sort());
  });

  test('a read of the history cannot be written back into the log', () => {
    const log = logWithJob();
    const rows = log.records();
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0])).toBe(true);
    expect(() => {
      (rows[0] as { actor: string }).actor = 'someone_else';
    }).toThrow();
    expect(log.records()[0]!.actor).toBe('officer_nomsa');
    expect(() => {
      (rows as unknown as unknown[]).push('forged row');
    }).toThrow();
    expect(log.length).toBe(2);
  });

  test('the first entry of a job must be its intake', () => {
    const log = new CustodyLog();
    expect(() => log.append({ jobId: 'ghost', from: null, to: 'captured', actor: 'a', at: T0, evidence: 'x' })).toThrow(CaptureError);
    expect(() => log.append({ jobId: 'ghost', from: 'intake', to: 'intake', actor: 'a', at: T0, evidence: 'x' })).toThrow(CaptureError);
  });

  test('an entry naming a state the job was never in is refused', () => {
    const log = logWithJob();
    let caught: unknown;
    try {
      log.append({ jobId: 'job_custody_1', from: 'processed', to: 'qc_auto', actor: 'tech_lutho', at: later(20), evidence: 'gates=8/8' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CaptureError);
    expect((caught as CaptureError).message).toInclude('captured');
  });

  test('an illegal transition cannot be written into history even with a witness', () => {
    const log = logWithJob();
    expect(() =>
      log.append({ jobId: 'job_custody_1', from: 'captured', to: 'published', actor: 'manager_dipuo', at: later(30), evidence: 'we felt it was fine' }),
    ).toThrow(CaptureError);
    expect(log.lastState('job_custody_1')).toBe('captured');
  });

  test('a judgement entry with no evidence behind it is refused', () => {
    const log = logWithJob();
    log.append({ jobId: 'job_custody_1', from: 'captured', to: 'processed', actor: 'tech_lutho', at: later(20), evidence: 'scale=0.01;renditions=lod0=2000B' });
    expect(() => log.append({ jobId: 'job_custody_1', from: 'processed', to: 'qc_auto', actor: 'tech_lutho', at: later(25), evidence: null })).toThrow(CaptureError);
    expect(() => log.append({ jobId: 'job_custody_1', from: 'processed', to: 'qc_auto', actor: 'tech_lutho', at: later(26), evidence: '   ' })).toThrow(CaptureError);
  });

  test('an entry without a named actor is refused', () => {
    const log = logWithJob();
    expect(() => log.append({ jobId: 'job_custody_1', from: 'captured', to: 'processed', actor: '', at: later(20), evidence: 'x' })).toThrow(CaptureError);
  });

  test('custody time cannot run backwards', () => {
    const log = logWithJob();
    expect(() => log.append({ jobId: 'job_custody_1', from: 'captured', to: 'processed', actor: 'tech_lutho', at: later(-5), evidence: 'scale ok' })).toThrow(CaptureError);
  });

  test('every row folds the previous digest in, so the chain verifies when untouched', () => {
    const log = logWithJob();
    const rows = log.records();
    expect(rows[0]!.prevHash).toBe(GENESIS_HASH);
    expect(rows[1]!.prevHash).toBe(rows[0]!.hash);
    expect(log.verify()).toEqual({ ok: true, entries: 2 });
    log.verifyOrThrow();
  });

  test('editing one actor in the file breaks verification on open', () => {
    const file = tempCustodyFile();
    const log = openCustodyLog(file);
    log.append({ jobId: 'j', from: null, to: 'intake', actor: 'officer_nomsa', at: T0, evidence: 'item=itm_9;price=420000' });
    log.append({ jobId: 'j', from: 'intake', to: 'captured', actor: 'tech_lutho', at: later(5), evidence: 'frames=48' });

    // Someone with the file open changes who took the item. Nothing in the file format stops the
    // edit; the point of the chain is that it cannot survive one.
    writeFileSync(file, readFileSync(file, 'utf8').replace('officer_nomsa', 'someone_else'), 'utf8');
    let caught: unknown;
    try {
      openCustodyLog(file);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CaptureError);
    expect((caught as CaptureError).code).toBe('custody_chain_broken');
  });

  test('a dropped row is caught by the sequence and the link', () => {
    const log = new CustodyLog();
    const rows = [
      log.append({ jobId: 'j', from: null, to: 'intake', actor: 'officer_nomsa', at: T0, evidence: 'item=itm_9;price=420000' }),
      log.append({ jobId: 'j', from: 'intake', to: 'captured', actor: 'tech_lutho', at: later(5), evidence: 'frames=48' }),
      log.append({ jobId: 'j', from: 'captured', to: 'processed', actor: 'tech_lutho', at: later(9), evidence: 'scale ok' }),
    ];
    const file = tempCustodyFile();
    // The intake row is gone: the history now claims the job started at captured.
    writeFileSync(file, rows.slice(1).map((row) => rowJson(row)).join(''), 'utf8');
    let caught: unknown;
    try {
      openCustodyLog(file);
    } catch (error) {
      caught = error;
    }
    expect((caught as CaptureError).code).toBe('custody_chain_broken');
    expect((caught as CaptureError).message).toInclude('sequence');
  });

  test('a written log re-opens and continues without losing the chain', () => {
    const file = tempCustodyFile();
    const first = openCustodyLog(file);
    first.append({ jobId: 'j', from: null, to: 'intake', actor: 'officer_nomsa', at: T0, evidence: 'item=itm_9;price=420000' });
    const reopened = openCustodyLog(file);
    expect(reopened.records('j').length).toBe(1);
    reopened.append({ jobId: 'j', from: 'intake', to: 'captured', actor: 'tech_lutho', at: later(5), evidence: 'frames=48' });
    expect(openCustodyLog(file).verify()).toEqual({ ok: true, entries: 2 });
    // Appending really went to disk, in order.
    expect(readFileSync(file, 'utf8').trim().split('\n').length).toBe(2);
  });

  test('two jobs share one chain, so a row cannot be dropped for either of them', () => {
    const file = tempCustodyFile();
    const log = openCustodyLog(file);
    log.append({ jobId: 'job_a', from: null, to: 'intake', actor: 'officer_nomsa', at: T0, evidence: 'item=itm_1;price=420000' });
    log.append({ jobId: 'job_a', from: 'intake', to: 'captured', actor: 'tech_lutho', at: later(1), evidence: 'frames=48' });
    log.append({ jobId: 'job_b', from: null, to: 'intake', actor: 'officer_dipuo', at: later(2), evidence: 'item=itm_2;price=310000' });
    const rows = log.records();
    expect(rows[2]!.prevHash).toBe(rows[1]!.hash);
    expect(log.records('job_b').length).toBe(1);
    expect(() => log.append({ jobId: 'job_a', from: 'captured', to: 'published', actor: 'officer_dipuo', at: later(3), evidence: 'asset=ast_1' })).toThrow(CaptureError);
    const reopened = openCustodyLog(file);
    expect(reopened.verify()).toEqual({ ok: true, entries: 3 });
  });
});
