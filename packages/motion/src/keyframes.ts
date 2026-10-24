/**
 * Token-driven CSS keyframes (07 §5, animation layer).
 *
 * This is the DOM half of the motion contract: seven named animations, each declared with a
 * duration and curve drawn from the palette in tokens.ts. No number below is a hand-tuned
 * millisecond — `duration` is a `DurationName`, and the emitted CSS reads the value from the
 * chosen personality (premium by default), exactly like css-vars.ts does for custom properties.
 *
 * Product rules encoded here:
 *  - No infinite loop outside a loading indicator. Only `spinner` iterates forever; the
 *    skeleton shimmer is a single settle pass, so a dashboard can never become a lava lamp.
 *  - No large displacement. Arrival offsets are 0.25–0.75rem, a cue rather than a slide.
 *  - Every class is neutralised by `prefers-reduced-motion: reduce` in the same string, so a
 *    caller that only pastes `motionCss()` still gets the contract.
 *
 * Delays are all zero: stagger would be an invented duration, and dashboard surfaces are
 * scanned, not watched. Zero delay is omitted from the CSS, which also keeps every `Nms` in
 * the output a real token value.
 */

import { REDUCE_QUERY } from './reduced-motion.js';
import {
  personalities,
  type DurationName,
  type EaseName,
  type MotionPersonality,
} from './tokens.js';

export const animationNames = [
  'fade-in',
  'slide-up',
  'scale-in',
  'skeleton-shimmer',
  'spinner',
  'toast-in',
  'page-enter',
] as const;

export type AnimationName = (typeof animationNames)[number];

/** Iteration vocabulary: one pass for arrivals, forever only for the loading spinner. */
export const iterations = {
  once: 1,
  loop: 'infinite',
} as const;

export type AnimationIteration = number | 'infinite';

export interface KeyframeAnimation {
  readonly name: AnimationName;
  /** Key into the duration palette; never a literal millisecond value. */
  readonly duration: DurationName;
  /** Key into the easing palette. */
  readonly easing: EaseName;
  /** Milliseconds. Every current definition is 0 (no stagger) and omits the property. */
  readonly delayMs: number;
  readonly iteration: AnimationIteration;
  readonly fill: 'both' | 'forwards';
  /** Keyframe body, emitted inside `@keyframes motion-<name>`. */
  readonly frames: string;
}

export const animations: Readonly<Record<AnimationName, KeyframeAnimation>> = {
  'fade-in': {
    name: 'fade-in',
    duration: 'standard',
    easing: 'out',
    delayMs: 0,
    iteration: iterations.once,
    fill: 'both',
    frames: 'from { opacity: 0; }\n  to { opacity: 1; }',
  },
  'slide-up': {
    name: 'slide-up',
    duration: 'standard',
    easing: 'out',
    delayMs: 0,
    iteration: iterations.once,
    fill: 'both',
    // 0.75rem is a cue, not a cinematic slide; dashboards may not move content far.
    frames: 'from { opacity: 0; transform: translateY(0.75rem); }\n  to { opacity: 1; transform: none; }',
  },
  'scale-in': {
    name: 'scale-in',
    duration: 'standard',
    easing: 'out',
    delayMs: 0,
    iteration: iterations.once,
    fill: 'both',
    // 0.98 is the smallest scale change that still reads; anything larger moves the layout's
    // apparent weight and is reserved for brand surfaces, not tool screens.
    frames: 'from { opacity: 0; transform: scale(0.98); }\n  to { opacity: 1; transform: scale(1); }',
  },
  'skeleton-shimmer': {
    name: 'skeleton-shimmer',
    duration: 'slow',
    easing: 'steady',
    delayMs: 0,
    iteration: iterations.once,
    fill: 'forwards',
    // One finite pass: the placeholder settles, then rests. A loading *indicator* is the only
    // place the product allows continuous motion, and the spinner is that indicator.
    frames: 'from { background-position: 200% 0; }\n  to { background-position: -200% 0; }',
  },
  spinner: {
    name: 'spinner',
    duration: 'scene',
    easing: 'steady',
    delayMs: 0,
    iteration: iterations.loop,
    fill: 'both',
    frames: 'to { transform: rotate(360deg); }',
  },
  'toast-in': {
    name: 'toast-in',
    duration: 'standard',
    easing: 'out',
    delayMs: 0,
    iteration: iterations.once,
    fill: 'both',
    frames: 'from { opacity: 0; transform: translateY(0.5rem); }\n  to { opacity: 1; transform: none; }',
  },
  'page-enter': {
    name: 'page-enter',
    duration: 'standard',
    easing: 'out',
    delayMs: 0,
    iteration: iterations.once,
    fill: 'both',
    // A route swap is already on screen when this class lands; motion only softens the cut.
    frames: 'from { opacity: 0; transform: translateY(0.25rem); }\n  to { opacity: 1; transform: none; }',
  },
};

/** One class per animation, namespaced so a consumer stylesheet cannot collide by accident. */
export function animationClassName(name: AnimationName): string {
  return `motion-${name}`;
}

function keyframesBlock(name: AnimationName): string {
  const spec = animations[name];
  return `@keyframes ${animationClassName(name)} {\n  ${spec.frames}\n}`;
}

function classBlock(spec: KeyframeAnimation, personality: MotionPersonality): string {
  const lines = [
    `  animation-name: ${animationClassName(spec.name)};`,
    `  animation-duration: ${personality.durations[spec.duration]}ms;`,
    `  animation-timing-function: ${personality.easing[spec.easing]};`,
    // A zero delay is the absence of motion, not an invented token; omit it.
    ...(spec.delayMs > 0 ? [`  animation-delay: ${spec.delayMs}ms;`] : []),
    `  animation-iteration-count: ${spec.iteration};`,
    `  animation-fill-mode: ${spec.fill};`,
  ];
  if (spec.name === 'spinner') lines.push('  transform-origin: center;');
  return `.${animationClassName(spec.name)} {\n${lines.join('\n')}\n}`;
}

function reducedRule(names: readonly AnimationName[]): string {
  const selectors = names.map((name) => `.${animationClassName(name)}`).join(',\n  ');
  return `@media ${REDUCE_QUERY} {
  /* Every animation in this sheet is removable. The DOM state change remains; only the
     flourish goes, so nothing is hidden and no content waits on an animation. */
  ${selectors} {
    animation: none !important;
  }
}`;
}

/**
 * The keyframes plus one class for a single animation, including its own reduced-motion rule.
 * Components use this so a page loads only the motion it actually renders.
 */
export function animationCss(
  name: AnimationName,
  personality: MotionPersonality = personalities.premium,
): string {
  return `/* @nastech/motion — ${animationClassName(name)} (${personality.name}). */
${keyframesBlock(name)}
${classBlock(animations[name], personality)}
${reducedRule([name])}`;
}

/**
 * One string with every keyframes block, every class and one reduced-motion block.
 *
 * Named `motionCss` to match the task-level vocabulary; the package barrel exports this as
 * `keyframeCss` because `motionCss` is already the custom-property stylesheet in css-vars.ts.
 */
export function motionCss(personality: MotionPersonality = personalities.premium): string {
  const blocks = animationNames.map((name) => `${keyframesBlock(name)}\n${classBlock(animations[name], personality)}`);
  return `/* @nastech/motion — keyframes, personality: ${personality.name}. Generated; do not hand-edit. */
${blocks.join('\n\n')}

${reducedRule(animationNames)}
`;
}
