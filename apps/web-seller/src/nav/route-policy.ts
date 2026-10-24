import type { RouteDef } from '../router.js';

/**
 * Class-based policy for the two things a seller must never have to trust a page for:
 * motion and the scene runtime.
 */

export interface MotionPolicy {
  readonly animate: boolean;
  readonly reason: string;
}

/**
 * Route-enter motion belongs to navigation. Payouts and settings are money/credential screens:
 * a moving balance reads as a changing balance, so they are still and always were. Sign-in is
 * critical too and gets the same treatment.
 */
export function routeMotionPolicy(route: RouteDef): MotionPolicy {
  if (route.class === 'critical') {
    return {
      animate: false,
      reason: 'Money and credential surfaces do not animate; movement must not imply a balance changed.',
    };
  }
  return {
    animate: true,
    reason: 'A short route-enter transition between screens; never per-field or in-form motion.',
  };
}

export const SCENE_FAILURE_COPY =
  'The 3D preview did not load. The photographs and the written condition notes on this page are complete — the static path is enough to carry on.';

export interface ScenePolicy {
  /** Only `scene` routes may load the scene runtime, and only lazily from inside the route. */
  readonly lazy: boolean;
  /** Structural invariant: the route renders with or without its canvas. */
  readonly routeSurvivesSceneFailure: true;
  readonly failureCopy: string;
}

export function scenePolicy(route: RouteDef): ScenePolicy {
  return {
    lazy: route.class === 'scene',
    routeSurvivesSceneFailure: true,
    failureCopy: SCENE_FAILURE_COPY,
  };
}
