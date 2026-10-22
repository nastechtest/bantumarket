import { describe, expect, test } from 'bun:test';
import type { CaptureJobState } from '@nastech/api-contracts';
import { money } from '@nastech/api-contracts';
import { CaptureError } from '../errors.js';
import {
  JOB_STATES,
  TRANSITIONS,
  advance,
  assertTransition,
  canTransition,
  createJob,
  isTerminal,
  pathProgress,
} from '../job-state.js';

/** The machine as the brief and `media.capture_jobs` describe it, spelled once. */
const EXPECTED: Readonly<Record<CaptureJobState, readonly CaptureJobState[]>> = {
  intake: ['captured'],
  captured: ['processed'],
  processed: ['qc_auto'],
  qc_auto: ['qc_human', 'failed', 'reshot'],
  qc_human: ['published', 'failed', 'reshot'],
  published: [],
  failed: [],
  reshot: ['captured'],
};

function jobIn(state: CaptureJobState): ReturnType<typeof createJob> {
  const base = createJob({
    jobId: 'job_state_test',
    itemId: 'itm_1',
    listingId: 'lst_1',
    title: 'Seiko Presage 40.5 mm',
    price: money(420_000),
    actor: 'officer_nomsa',
    receiptCode: null,
    assetId: 'ast_1',
    now: '2026-04-01T08:00:00.000Z',
  });
  return { ...base, state };
}

describe('capture job state machine', () => {
  test('the state vocabulary is the contract vocabulary, not a second spelling', () => {
    // If api-contracts gains or drops a state, this table has to be re-read against it; the assert
    // is that TRANSITIONS covers exactly the declared set and nothing else.
    expect([...JOB_STATES].sort()).toEqual(Object.keys(TRANSITIONS).sort());
    expect(JOB_STATES.length).toBe(8);
  });

  test('every pair of states is either legal by table or rejected with a reason', () => {
    let legal = 0;
    let rejected = 0;
    for (const from of JOB_STATES) {
      for (const to of JOB_STATES) {
        const allowed = EXPECTED[from].includes(to);
        const verdict = canTransition(from, to);
        if (allowed) {
          legal += 1;
          expect(verdict.ok).toBe(true);
          expect(() => assertTransition(from, to)).not.toThrow();
        } else {
          rejected += 1;
          expect(verdict.ok).toBe(false);
          if (!verdict.ok) expect(verdict.reason.length).toBeGreaterThan(20);
          let caught: unknown;
          try {
            assertTransition(from, to);
          } catch (error) {
            caught = error;
          }
          expect(caught).toBeInstanceOf(CaptureError);
          expect((caught as CaptureError).code).toBe('illegal_transition');
          expect((caught as CaptureError).exitCode).not.toBe(0);
          // The reason has to name both states, or the operator cannot act on it.
          expect((caught as CaptureError).message).toInclude(from);
          expect((caught as CaptureError).message).toInclude(to);
        }
      }
    }
    // 64 pairs, 10 legal edges. Pinning the counts means a table edit cannot pass unnoticed.
    expect(legal).toBe(10);
    expect(rejected).toBe(54);
  });

  test('published and failed are closed: a re-shoot opens a new version, it does not reopen history', () => {
    expect(isTerminal('published')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    for (const to of JOB_STATES) {
      expect(canTransition('published', to).ok).toBe(false);
      expect(canTransition('failed', to).ok).toBe(false);
    }
  });

  test('skipping a step is refused by name, not silently tolerated', () => {
    const verdict = canTransition('captured', 'published');
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toInclude('evidence');
  });

  test('a self-transition records nothing and is therefore not a transition', () => {
    for (const state of JOB_STATES) {
      expect(canTransition(state, state).ok).toBe(false);
    }
  });

  test('advancing from reshot opens the next asset version instead of editing the current one', () => {
    const version2 = advance(jobIn('reshot'), 'captured', '2026-04-02T08:00:00.000Z');
    expect(version2.assetVersion).toBe(2);
    expect(version2.state).toBe('captured');
    const elsewhere = advance(jobIn('intake'), 'captured', '2026-04-02T08:00:00.000Z');
    expect(elsewhere.assetVersion).toBe(1);
  });

  test('advance does not mutate the job it was given', () => {
    const original = jobIn('intake');
    const moved = advance(original, 'captured', '2026-04-02T08:00:00.000Z');
    expect(original.state).toBe('intake');
    expect(moved.state).toBe('captured');
  });

  test('progress reports the linear path and treats the branches honestly', () => {
    expect(pathProgress('intake')).toEqual({ step: 1, of: 6, label: 'intake' });
    expect(pathProgress('published')).toEqual({ step: 6, of: 6, label: 'published' });
    // A re-shoot is back at step 2, not at step 7: the pipeline has no seventh stage.
    expect(pathProgress('reshot').step).toBe(2);
    expect(pathProgress('failed').step).toBe(6);
  });

  test('a job cannot be created without the person who took the item', () => {
    expect(() =>
      createJob({
        jobId: 'job_no_actor',
        itemId: 'itm_2',
        listingId: null,
        title: 'Casio',
        price: money(45_000),
        actor: '   ',
        receiptCode: null,
        assetId: null,
        now: '2026-04-01T08:00:00.000Z',
      }),
    ).toThrow(CaptureError);
  });
});
