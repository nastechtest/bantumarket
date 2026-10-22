import { describe, expect, it } from 'bun:test';
import { defaultVarsMatchTokens, motionCss, motionVarNames, reducedMotionCss } from '../src/css-vars.js';
import { FOCUS_RING_CSS } from '../src/focus-ring.js';
import { REDUCE_QUERY } from '../src/reduced-motion.js';
import { durations, personalities } from '../src/tokens.js';

describe('css-vars output', () => {
  it('contains the reduce media query sourced from reduced-motion.ts', () => {
    const css = motionCss();
    expect(css).toContain(`@media ${REDUCE_QUERY}`);
    expect(reducedMotionCss()).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('emits the palette as custom properties and zeroes them under reduce', () => {
    const css = motionCss();
    for (const name of ['quick', 'standard', 'slow', 'scene'] as const) {
      expect(css).toContain(`${motionVarNames.duration(name)}: ${durations[name]}ms`);
    }
    const reduce = reducedMotionCss();
    expect(reduce).toContain('--motion-scene: 0ms');
    expect(reduce).toContain('[data-parallax] { transform: none !important; }');
    expect(defaultVarsMatchTokens()).toBe(true);
  });

  it('personality choice changes emitted durations (restrained is tighter than premium)', () => {
    const premium = motionCss();
    const restrained = motionCss(personalities.restrained);
    expect(premium).toContain('--motion-standard: 220ms');
    expect(restrained).toContain('--motion-standard: 120ms');
    expect(restrained).toContain('personality: restrained');
  });

  it('focus ring CSS is focus-visible based, token-coloured, and structurally un-animatable', () => {
    expect(FOCUS_RING_CSS).toContain(':focus-visible');
    expect(FOCUS_RING_CSS).toContain('--focus-ring-color');
    expect(FOCUS_RING_CSS).toContain('forced-colors');
    // Keyboard users must never lose the ring to an animation: the ring simply has no
    // motion properties to lose it with.
    expect(FOCUS_RING_CSS).not.toContain('transition');
    expect(FOCUS_RING_CSS).not.toContain('animation');
  });
});
