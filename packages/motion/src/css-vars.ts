/**
 * CSS custom properties (07 §5's delivery half).
 *
 * apps/web-public's stylesheet consumes motion values without importing TS — a stylesheet
 * that imported the token module would couple the CSS pipeline to the JS one. This
 * generator is the bridge, and the `@media (prefers-reduced-motion: reduce)` block is
 * generated here so the reduce rule has exactly one source in the repo (the query string
 * itself comes from reduced-motion.ts).
 */

import { REDUCE_QUERY } from './reduced-motion.js';
import { durations, personalities, type DurationName, type EaseName, type MotionPersonality } from './tokens.js';
import { focusRing } from './focus-ring.js';

const DURATION_NAMES: DurationName[] = ['quick', 'standard', 'slow', 'scene'];
const EASE_NAMES: EaseName[] = ['in', 'out', 'inOut', 'steady'];

export const motionVarNames = {
  duration: (name: DurationName) => `--motion-${name}`,
  ease: (name: EaseName) => `--ease-${name}`,
} as const;

/** The reduce block, kept separate because a test asserts on it directly. */
export function reducedMotionCss(): string {
  const lines = [
    ...DURATION_NAMES.map((name) => `    ${motionVarNames.duration(name)}: 0ms;`),
    ...EASE_NAMES.map((name) => `    ${motionVarNames.ease(name)}: linear;`),
  ];
  // Durations zeroed, not motion "paused": with 0ms a state change still repaints to its
  // new value — instantly. That is the feedback exception from reduced-motion.ts expressed
  // in CSS. Parallax is the one thing removed outright; it has nothing to instantise.
  return `@media ${REDUCE_QUERY} {
  /* Parallax and decorative/transition motion are off. The evidence that a state changed
     is not: every duration is 0, so changes land instantly instead of not landing. */
  :root {
${lines.join('\n')}
  }
  [data-parallax] { transform: none !important; }
}`;
}

/**
 * Full stylesheet fragment: variables for the given personality plus the reduce block.
 * Premium by default; pass personalities.restrained for a money-path-scoped document.
 */
export function motionCss(personality: MotionPersonality = personalities.premium): string {
  const rootLines: string[] = [];
  for (const name of DURATION_NAMES) {
    rootLines.push(`  ${motionVarNames.duration(name)}: ${personality.durations[name]}ms;`);
  }
  for (const name of EASE_NAMES) {
    rootLines.push(`  ${motionVarNames.ease(name)}: ${personality.easing[name]};`);
  }
  rootLines.push(`  --focus-ring-color: ${focusRing.color};`);
  rootLines.push(`  --focus-ring-width: ${focusRing.widthPx}px;`);
  rootLines.push(`  --focus-ring-offset: ${focusRing.offsetPx}px;`);

  return `/* @nastech/motion — generated, personality: ${personality.name}. Do not hand-edit. */
:root {
${rootLines.join('\n')}
}
${reducedMotionCss()}`;
}

/** Guard used by tests and by the controller's integration check: the emitted default
 *  durations are the premium palette, and premium is the module's `durations` itself. */
export function defaultVarsMatchTokens(): boolean {
  return DURATION_NAMES.every((name) => motionCss().includes(`${motionVarNames.duration(name)}: ${durations[name]}ms`));
}
