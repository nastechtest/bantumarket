import { describe, expect, it } from 'bun:test';
import {
  animationClassName,
  animationCss,
  animationNames,
  animations,
  motionCss,
} from '../src/keyframes.js';
import { durations, easing } from '../src/tokens.js';
import { REDUCE_QUERY } from '../src/reduced-motion.js';

describe('token-driven keyframes', () => {
  it('every animation has a unique name and a matching registry key', () => {
    const classNames = animationNames.map(animationClassName);
    expect(new Set(classNames).size).toBe(animationNames.length);
    expect(new Set(animationNames).size).toBe(animationNames.length);
    for (const name of animationNames) {
      expect(animations[name].name).toBe(name);
    }
  });

  it('every duration and easing is a value from the existing palettes, not a literal', () => {
    for (const name of animationNames) {
      const spec = animations[name];
      expect(Object.keys(durations)).toContain(spec.duration);
      expect(Object.keys(easing)).toContain(spec.easing);
      expect(Number.isInteger(animations[name].delayMs)).toBe(true);
    }
  });

  it('motionCss() emits exactly one @keyframes block per animation and its class', () => {
    const css = motionCss();
    for (const name of animationNames) {
      expect(css).toContain(`@keyframes ${animationClassName(name)}`);
      expect(css).toContain(`.${animationClassName(name)} {`);
    }
    expect(css.match(/@keyframes /g)?.length).toBe(animationNames.length);
  });

  it('every emitted ms duration is one of the token values (no 0ms or hand-tuned numbers)', () => {
    const css = motionCss();
    const allowed = new Set<number>(Object.values(durations));
    const emitted = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    expect(emitted.length).toBeGreaterThan(0);
    for (const ms of emitted) expect(allowed.has(ms)).toBe(true);
  });

  it('only the spinner loops forever', () => {
    const css = motionCss();
    const infiniteRules = [...css.matchAll(/\.(motion-[a-z-]+) \{[^}]*animation-iteration-count: infinite;/g)].map(
      (match) => match[1],
    );
    expect(infiniteRules).toEqual(['motion-spinner']);
    expect(css.match(/\binfinite\b/g)?.length).toBe(1);
  });

  it('all animations are removable by prefers-reduced-motion', () => {
    const css = motionCss();
    expect(css).toContain(`@media ${REDUCE_QUERY}`);
    const reduceBlock = css.slice(css.indexOf('@media '));
    for (const name of animationNames) {
      expect(reduceBlock).toContain(`.${animationClassName(name)}`);
    }
    expect(reduceBlock).toContain('animation: none !important');
  });

  it('the per-animation helper ships one keyframes block and its own reduce rule', () => {
    const css = animationCss('fade-in');
    expect(css.match(/@keyframes /g)?.length).toBe(1);
    expect(css).toContain('@keyframes motion-fade-in');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toContain('motion-spinner');
  });
});
