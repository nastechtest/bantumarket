/**
 * The reduced-motion contract (07 §5.3).
 *
 * The line this file draws, and the whole reason the package exists beyond tokens:
 * prefers-reduced-motion removes motion that is *the point* (parallax, decorative ambience,
 * page transitions). It does not remove motion whose point is *that something changed* —
 * a completed handover must still be felt. Under reduction, feedback lands instantly
 * (zero duration) instead of not landing at all.
 */

export const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Every animated thing in the app classifies into exactly one of these, and `motionOk` is
 * the only place the reduced-motion decision is made. If a call site re-implements it,
 * the contract has already started to rot.
 */
export type MotionKind =
  /** Ambient flourish with no informational content (reveals, hero drift). */
  | 'decorative'
  /** Depth parallax inside the pilot item page's scene, high-LOD path only. */
  | 'parallax'
  /** Route enter/exit and open/close choreography. */
  | 'transition'
  /** Confirmation that a state change occurred. Never suppressed — see motionOk below. */
  | 'feedback';

// Override exists for two real cases: the CI no-3d render mode has no matchMedia, and tests
// must exercise both directions of the contract deterministically. Production code reads
// the media query; a non-null override replaces it wholesale.
let override: boolean | null = null;

export function setReducedMotionOverride(value: boolean | null): void {
  override = value;
}

export function prefersReducedMotion(): boolean {
  if (override !== null) return override;
  // No window (SSG pre-render) or no matchMedia: full motion. Reduced motion is something the
  // user asks for; guessing it on their behalf would hide the brand, not protect anyone.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCE_QUERY).matches === true;
}

const listeners = new Set<(reduced: boolean) => void>();
let query: MediaQueryList | null = null;

function emit(reduced: boolean): void {
  for (const l of listeners) l(reduced);
}

function onChange(event: MediaQueryListEvent): void {
  emit(event.matches);
}

/**
 * Subscribe to preference changes. Returns an unsubscribe that is safe to call twice and
 * tears the MediaQueryList listener down when nobody is left — the scene path and the DOM
 * path both subscribe through this so there is one listener per app, not one per component.
 */
export function subscribeReducedMotion(listener: (reduced: boolean) => void): () => void {
  listeners.add(listener);
  if (query === null && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    query = window.matchMedia(REDUCE_QUERY);
    query.addEventListener('change', onChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && query !== null) {
      query.removeEventListener('change', onChange);
      query = null;
    }
  };
}

/**
 * The rule. `feedback` is the only kind that survives reduction because it is not motion
 * for its own sake — it is the user's evidence that their action took effect (handover
 * completed, dispute filed). Everything else yields to the preference.
 *
 * Also false when the running personality itself vetoes the kind (e.g. restrained vetoes
 * parallax on the money path); pass that verdict via `allowedByBrand` from the caller's
 * personality check. Kept as a parameter rather than a module-level personality singleton
 * because one page can host more than one surface.
 */
export function motionOk(kind: MotionKind, allowedByBrand = true): boolean {
  if (kind === 'feedback') return allowedByBrand;
  return allowedByBrand && !prefersReducedMotion();
}
