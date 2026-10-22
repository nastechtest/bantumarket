import { describe, expect, test } from 'bun:test';
import { createContextLossTracker, isTerminal } from '../context-loss.js';

describe('context-loss state machine', () => {
  test('happy path idle → live → lost records exactly one log per edge', () => {
    let clock = 0;
    const tracker = createContextLossTracker(() => (clock += 10));
    expect(tracker.state()).toBe('idle');

    expect(tracker.start()).toBe(true);
    expect(tracker.start()).toBe(false); // already live: illegal, not recorded
    expect(tracker.lose('gpu-pressure')).toBe(true);
    expect(tracker.state()).toBe('lost');

    expect(tracker.transitions).toHaveLength(2);
    expect(tracker.transitions[0]?.to).toBe('live');
    expect(tracker.transitions[1]?.reason).toBe('gpu-pressure');
  });

  test('loss is terminal: no edge leaves lost, not even back to live', () => {
    const tracker = createContextLossTracker(() => 1);
    tracker.start();
    tracker.lose('context-lost');
    expect(tracker.start()).toBe(false);
    expect(tracker.lose('again')).toBe(false);
    expect(tracker.refuse('anything')).toBe(false);
    expect(tracker.state()).toBe('lost');
    expect(tracker.transitions).toHaveLength(2); // nothing appended after the terminal edge
  });

  test('refused is the no-webgl entry and is terminal too', () => {
    const tracker = createContextLossTracker(() => 1);
    expect(tracker.refuse('no-webgl')).toBe(true);
    expect(isTerminal(tracker.state())).toBe(true);
    expect(tracker.start()).toBe(false);
    expect(tracker.lose('late')).toBe(false);
  });

  test('a context lost before onReady (idle → lost) is legal and terminal', () => {
    const tracker = createContextLossTracker(() => 1);
    expect(tracker.lose('lost-before-ready')).toBe(true);
    expect(tracker.state()).toBe('lost');
  });

  test('subscribers receive each real transition exactly once and unsubscribing stops delivery', () => {
    const tracker = createContextLossTracker(() => 1);
    const seen: string[] = [];
    const unsubscribe = tracker.subscribe((t) => seen.push(`${t.from}->${t.to}`));
    tracker.start();
    tracker.start(); // illegal: must not notify
    tracker.lose('boom');
    unsubscribe();
    tracker.refuse('ignored'); // terminal state: illegal anyway, but belt and braces
    expect(seen).toEqual(['idle->live', 'live->lost']);
  });
});
