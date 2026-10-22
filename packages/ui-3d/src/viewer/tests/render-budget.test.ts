import { describe, expect, test } from 'bun:test';
import { sceneTokens } from '@nastech/ui-3d/tokens';
import { continuousRepaintBudgetScale } from '@nastech/ui-3d/quality';
import {
  FRAME_RATES,
  devicePixelsPerFrame,
  governorFrameBudgetMs,
  levelFor,
  maxSustainedFps,
  pixelBudgetFor,
  pixelsPerSecond,
} from '../render-budget.js';
import { makeCapability } from './fixtures.js';

const ceiling = sceneTokens.maxPixelsPerSecondBudget;

describe('render-budget', () => {
  test('the ceiling is a per-SECOND rate: the reference canvas keeps 60 fps', () => {
    // Regression on the 2.6M reading, which made every real inspection canvas `static`.
    // 350x350 css at dpr 2 = 490k device px/frame; 29.4M px/s is nowhere near a 156M px/s ceiling.
    expect(ceiling).toBe(156_000_000);
    expect(pixelsPerSecond(350, 350, 2, 60)).toBe(29_400_000);
    expect(levelFor(makeCapability({ deviceMemoryGb: 8 }), { width: 350, height: 350 })).toBe('high');
  });

  test('a capable device gets the whole ceiling and a weak one a share of it', () => {
    expect(continuousRepaintBudgetScale(makeCapability({ deviceMemoryGb: 8 }))).toBe(1);
    expect(pixelBudgetFor(makeCapability({ deviceMemoryGb: 8 }))).toBe(ceiling);
    expect(pixelBudgetFor(makeCapability())).toBeLessThan(ceiling);
  });

  test('the tier ladder is canvas area against the device share, at 60 then 30 fps', () => {
    const cap = makeCapability(); // webgl2, 4 GB → share 0.65 → 101.4M px/s, dpr cap 2
    expect(pixelBudgetFor(cap)).toBeCloseTo(0.65 * ceiling, 0);
    expect(levelFor(cap, { width: 600, height: 600 })).toBe('high');
    expect(levelFor(cap, { width: 800, height: 800 })).toBe('balanced');
    expect(levelFor(cap, { width: 1000, height: 1000 })).toBe('static');
  });

  test('a webgl1 device tiers down at the same canvas size the reference device calls high', () => {
    const weak = makeCapability({ gl: 'webgl1', maxTextureSize: 2048 });
    expect(pixelBudgetFor(weak)).toBe(0.4 * ceiling);
    // dpr is capped to 1.5 here, so per-frame pixels shrink too — the share still bites.
    expect(levelFor(weak, { width: 1000, height: 1000 })).toBe('static');
    expect(levelFor(weak, { width: 600, height: 600 })).toBe('high');
  });

  test('reduced motion is static unconditionally: it is a product rule, not a perf hint', () => {
    expect(levelFor(makeCapability({ prefersReducedMotion: true }), { width: 4, height: 4 })).toBe('static');
  });

  test('no WebGL is static — and that path must not even reach the fetch', () => {
    const none = makeCapability({ gl: 'none', maxTextureSize: 0 });
    expect(pixelBudgetFor(none)).toBe(0);
    expect(levelFor(none, { width: 4, height: 4 })).toBe('static');
  });

  test('connection and save-data do not shrink a GPU budget — they gate bytes, not fill rate', () => {
    const cap = makeCapability({ deviceMemoryGb: 8 });
    expect(pixelBudgetFor(cap)).toBe(pixelBudgetFor({ ...cap, effectiveConnection: '3g', saveData: true }));
  });

  test('maxSustainedFps inverts the device budget exactly and the level boundaries agree with it', () => {
    const cap = makeCapability({ deviceMemoryGb: 8 });
    const dpr = 2;
    expect(maxSustainedFps(100, 100, dpr, cap)).toBeCloseTo(ceiling / devicePixelsPerFrame(100, 100, dpr), 5);
    // A canvas whose sustained fps sits between 30 and 60 must be `balanced`, never `high`.
    const justUnder60 = Math.sqrt(ceiling / FRAME_RATES.high / (dpr * dpr));
    expect(levelFor(cap, { width: justUnder60 - 1, height: justUnder60 - 1 })).toBe('high');
    expect(levelFor(cap, { width: justUnder60 * 1.1, height: justUnder60 * 1.1 })).toBe('balanced');
  });

  test('a zero-area canvas sustains infinitely rather than dividing by zero', () => {
    expect(maxSustainedFps(0, 350, 2, makeCapability())).toBe(Number.POSITIVE_INFINITY);
  });

  test('every level yields a positive governor frame budget, static included', () => {
    expect(governorFrameBudgetMs('high')).toBeCloseTo(1000 / 60, 5);
    expect(governorFrameBudgetMs('balanced')).toBeCloseTo(1000 / 30, 5);
    expect(governorFrameBudgetMs('static')).toBeGreaterThan(0);
  });
});
