import { describe, expect, it } from 'bun:test';
import { durations, easing, personalityDuration, personalities, defaultPersonality } from '../src/tokens.js';

const PRESETS = ['premium', 'corporate', 'restrained'] as const;

describe('motion tokens', () => {
  it('base palette is quick 120 / standard 220 / slow 400 / scene 700', () => {
    expect(durations).toEqual({ quick: 120, standard: 220, slow: 400, scene: 700 });
  });

  it('duration ordering quick < standard < slow < scene holds for the palette and every personality', () => {
    for (const name of PRESETS) {
      const d = personalities[name].durations;
      expect(d.quick).toBeLessThan(d.standard);
      expect(d.standard).toBeLessThan(d.slow);
      expect(d.slow).toBeLessThan(d.scene);
    }
    expect(personalityDuration('premium', 'scene')).toBe(durations.scene);
  });

  it('every easing is a valid CSS value (cubic-bezier or linear)', () => {
    for (const curve of Object.values(easing)) {
      const ok = curve === 'linear' || /^cubic-bezier\(\s*[\d.]+\s*,\s*[\d.-]+\s*,\s*[\d.]+\s*,\s*[\d.-]+\s*\)$/.test(curve);
      expect(ok).toBe(true);
    }
  });

  it('personalities are documented and only the premium set permits parallax', () => {
    expect(defaultPersonality).toBe('premium');
    for (const name of PRESETS) {
      expect(personalities[name].surfaces.length).toBeGreaterThan(10);
    }
    expect(personalities.premium.parallax).toBe(true);
    // Corporate (seller app) and restrained (money path) must never drive scene flourish.
    expect(personalities.corporate.parallax).toBe(false);
    expect(personalities.restrained.parallax).toBe(false);
  });

  it('premium personality durations are the base palette, not a copy that can drift', () => {
    expect(personalities.premium.durations).toBe(durations);
  });
});
