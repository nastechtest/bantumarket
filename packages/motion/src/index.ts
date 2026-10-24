/**
 * @nastech/motion — brand motion tokens and the reduced-motion contract.
 *
 * Not an animation library. If you are looking for a tween engine, this is not it, and
 * adding one here is the scope creep the plan rejected. The scene runtime (ui-3d) applies
 * these values; the DOM path reads the CSS variables from motionCss().
 */

export {
  durations,
  easing,
  personalities,
  defaultPersonality,
  personalityDuration,
  type DurationName,
  type DurationPalette,
  type EaseName,
  type EaseSet,
  type MotionPersonality,
  type PersonalityName,
} from './tokens.js';

export {
  REDUCE_QUERY,
  prefersReducedMotion,
  setReducedMotionOverride,
  subscribeReducedMotion,
  motionOk,
  type MotionKind,
} from './reduced-motion.js';

export { parallaxOffsets, type ParallaxPose, type ParallaxLayer, type ParallaxOffset } from './parallax.js';

export {
  MAX_EXIT_MS,
  crossfade,
  useRouteTransition,
  type RoutePhase,
  type RouteTransitionState,
} from './use-transition-state.js';

export { focusRing, FOCUS_RING_CSS } from './focus-ring.js';

export { motionCss, reducedMotionCss, motionVarNames, defaultVarsMatchTokens } from './css-vars.js';

/**
 * Keyframes. `keyframes.ts` also names its generator `motionCss`; the barrel alias
 * `keyframeCss` keeps the existing `motionCss` (custom properties + reduce block) stable for
 * the apps that already paste it.
 */
export {
  animationNames,
  animations,
  animationClassName,
  animationCss,
  iterations,
  motionCss as keyframeCss,
  type AnimationName,
  type AnimationIteration,
  type KeyframeAnimation,
} from './keyframes.js';

export {
  PRESENCE_ENTER_CLASS,
  PRESENCE_EXIT_CLASS,
  createPresence,
  type Presence,
  type PresenceOptions,
  type PresencePhase,
} from './presence.js';
