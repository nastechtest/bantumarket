import { afterAll, describe, expect, it } from 'bun:test';
import {
  motionOk,
  prefersReducedMotion,
  setReducedMotionOverride,
  subscribeReducedMotion,
} from '../src/reduced-motion.js';

describe('reduced-motion contract', () => {
  afterAll(() => setReducedMotionOverride(null));

  it('disables parallax, decorative and transition kinds under reduce, but never feedback', () => {
    setReducedMotionOverride(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(motionOk('parallax')).toBe(false);
    expect(motionOk('decorative')).toBe(false);
    expect(motionOk('transition')).toBe(false);
    // The handover-completed flash lives here. If this flips to false, a completed action
    // becomes invisible — the exact failure 07 §5 says the rule must not cause.
    expect(motionOk('feedback')).toBe(true);
  });

  it('allows every kind when the user has no preference', () => {
    setReducedMotionOverride(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(motionOk('parallax')).toBe(true);
    expect(motionOk('decorative')).toBe(true);
    expect(motionOk('transition')).toBe(true);
    expect(motionOk('feedback')).toBe(true);
  });

  it('brand veto (personality parallax=false) overrides even an unhindered user', () => {
    setReducedMotionOverride(false);
    expect(motionOk('parallax', false)).toBe(false);
    expect(motionOk('feedback', false)).toBe(false);
  });

  it('feedback stays true through repeated kind checks (no sticky suppression)', () => {
    setReducedMotionOverride(true);
    for (let i = 0; i < 3; i++) expect(motionOk('feedback')).toBe(true);
  });

  it('subscribes without a DOM and unsubscribes cleanly', () => {
    // bun test has no window; the module must not crash, and the returned teardown must be
    // safe — this is the static-path/no-DOM environment rule.
    let calls = 0;
    const off = subscribeReducedMotion(() => calls++);
    expect(typeof off).toBe('function');
    off();
    off();
    expect(calls).toBe(0);
  });
});
