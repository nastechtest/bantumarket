import { describe, expect, test } from 'bun:test';
import { sceneTokens } from '@nastech/ui-3d/tokens';
import {
  FRAME_RATES,
  devicePixelsPerFrame,
  governorFrameBudgetMs,
  levelFor,
  maxSustainedFps,
  pixelsPerSecond,
} from '../render-budget.js';
import { makeCapability } from './fixtures.js';

const budget = sceneTokens.maxPixelsPerSecondBudget;

describe('render-budget', () => {
  test('a canvas that fits the budget at 60 fps is high', () => {
    // 100×100 css at dpr 2 = 40,000 device px/frame → 2.4M px/s at 60 fps ≤ 2.6M budget.
    expect(levelFor(makeCapability(), { width: 100, height: 100 })).toBe('high');
    expect(pixelsPerSecond(100, 100, 2, 60)).toBe(40_000 * 60);
  });

  test('a canvas that misses 60 but fits 30 is balanced', () => {
    // 120×120 at dpr 2 = 57,600 px/frame: 3.46M px/s at 60 (over), 1.73M at 30 (inside).
    const cap = makeCapability(); // webgl2, 4 GB → dpr cap 2
    expect(levelFor(cap, { width: 120, height: 120 })).toBe('balanced');
  });

  test('a big canvas on a capped device is static — the scene still inspects, just not continuously animating', () => {
    expect(levelFor(makeCapability(), { width: 350, height: 350 })).toBe('static');
  });

  test('reduced motion is static unconditionally: it is a product rule, not a perf hint', () => {
    expect(levelFor(makeCapability({ prefersReducedMotion: true }), { width: 4, height: 4 })).toBe('static');
  });

  test('no WebGL is static — and that path must not even reach the fetch', () => {
    expect(levelFor(makeCapability({ gl: 'none', maxTextureSize: 0 }), { width: 4, height: 4 })).toBe('static');
  });

  test('maxSustainedFps inverts the budget exactly and the level boundaries agree with it', () => {
    const dpr = 2;
    const fps = maxSustainedFps(100, 100, dpr);
    expect(fps).toBeCloseTo(budget / devicePixelsPerFrame(100, 100, dpr), 5);
    // A canvas whose sustained fps sits between 30 and 60 must be `balanced`, never `high`.
    const justUnder60 = Math.sqrt(budget / FRAME_RATES.high / (dpr * dpr)); // square canvas at the 60 fps edge
    expect(levelFor(makeCapability(), { width: justUnder60, height: justUnder60 })).toBe('high');
    expect(levelFor(makeCapability(), { width: justUnder60 * 1.1, height: justUnder60 * 1.1 })).toBe('balanced');
  });

  test('a zero-area canvas sustains infinitely rather than dividing by zero', () => {
    expect(maxSustainedFps(0, 350, 2)).toBe(Number.POSITIVE_INFINITY);
  });

  test('every level yields a positive governor frame budget, static included', () => {
    expect(governorFrameBudgetMs('high')).toBeCloseTo(1000 / 60, 5);
    expect(governorFrameBudgetMs('balanced')).toBeCloseTo(1000 / 30, 5);
    expect(governorFrameBudgetMs('static')).toBeGreaterThan(0);
  });
});
