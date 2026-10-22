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
