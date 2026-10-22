/**
 * Brand motion tokens (07 §5).
 *
 * This package is a token contract, not an animation library: durations and curves that the
 * DOM path and the scene path both obey, plus the three personality presets the plan names.
 * A token without a documented surface is a token nobody obeys, so every personality below
 * states where it applies and why.
 */

/** Base palette in ms. Ordering `quick < standard < slow < scene` is a tested invariant. */
export const durations = {
  quick: 120,
  standard: 220,
  slow: 400,
  scene: 700,
} as const;

export type DurationName = keyof typeof durations;
export type DurationPalette = Readonly<Record<DurationName, number>>;

/**
 * Curves, not names. `out` decelerates into place — motion arrives like a object set down,
 * not thrown. `in` accelerates away and is reserved for exits, where it must stay short
 * (see `MAX_EXIT_MS` in use-transition-state). `steady` is for continuous, non-emotive
 * motion (turntable scrubs) where any easing would read as friction.
 */
export const easing = {
  in: 'cubic-bezier(0.55, 0.09, 0.68, 0.19)',
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  steady: 'linear',
} as const;

export type EaseName = keyof typeof easing;
export type EaseSet = Readonly<Record<EaseName, string>>;

export interface MotionPersonality {
  readonly name: string;
  readonly durations: DurationPalette;
  readonly easing: EaseSet;
  /** Whether this personality permits depth parallax at all. Reduced motion can still veto it;
   *  this flag is the brand-side veto (money routes never get scene flourish). */
  readonly parallax: boolean;
  /** Which surfaces use this personality, in product terms. */
  readonly surfaces: string;
}

/**
 * Three personalities, no more. Adding a fourth is the scope creep the plan rejected.
 */
export const personalities = {
  /**
   * Premium — the default. Buyer-facing brand surfaces: the hero, the pilot item page
   * (including depth parallax in its scene on the high-LOD path), search-result card reveals.
   * Full palette, decelerating `out` on arrivals; this is where "premium" is felt.
   */
  premium: {
    name: 'premium',
    durations,
    easing,
    parallax: true,
    surfaces: 'brand hero; pilot item page and its 3D scene; search-result reveals',
  },
  /**
   * Corporate — seller app: listing management, capture-programme status, payouts views.
   * Tighter and more in-out: sellers repeat these screens daily, so arrival theatre is
   * friction. Never renders a scene, so `parallax` is false by role, not by taste.
   */
  corporate: {
    name: 'corporate',
    durations: { quick: 100, standard: 160, slow: 280, scene: 480 },
    easing,
    parallax: false,
    surfaces: 'seller app screens: listings, capture status, payouts',
  },
  /**
   * Restrained — the money path: sign-in, checkout, PIN, handover, dispute. Motion here
   * exists only to confirm a state changed; `scene` is nominal because critical-class routes
   * may not reach the scene runtime at all (check-3d-boundaries enforces that, not us).
   */
  restrained: {
    name: 'restrained',
    durations: { quick: 80, standard: 120, slow: 160, scene: 240 },
    // Exits and micro-arrivals only; the inOut curve reads as "businesslike", not "cinematic".
    easing: { in: easing.in, out: easing.inOut, inOut: easing.inOut, steady: easing.steady },
    parallax: false,
    surfaces: 'checkout; sign-in; PIN; handover; dispute — feedback motion only',
  },
} satisfies Record<string, MotionPersonality>;

export type PersonalityName = keyof typeof personalities;

/** Premium is the default everywhere except where the two presets above say otherwise. */
export const defaultPersonality: PersonalityName = 'premium';

export function personalityDuration(name: PersonalityName, which: DurationName): number {
  return personalities[name].durations[which];
}
