/**
 * Route-change transition state (07 §5).
 *
 * The constraint that shapes this file: a page transition may never delay first paint of
 * the next route's content. The implementation takes that literally — the active key flips
 * during render (React's documented derived-state adjustment), not in an effect, so the
 * commit that the browser paints already carries the new route. Enter animation is a CSS
 * class applied to content that is already on screen; the outgoing route is *also* painted
 * immediately, layered, and removed on a timer. Nothing here gates paint on an animation.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { durations } from './tokens.js';
import { prefersReducedMotion, subscribeReducedMotion } from './reduced-motion.js';

/** An exit may not hold the screen longer than `quick`. Longer exits read as cinema, and
 *  cinematic page transitions are on the plan's forbidden list. */
export const MAX_EXIT_MS = durations.quick;

export type RoutePhase = 'idle' | 'enter';

export interface RouteTransitionState {
  /** Always the newest route key — first paint of its content is never deferred. */
  readonly activeKey: string;
  /** Previous route, still rendered (inert) for at most MAX_EXIT_MS, or null. */
  readonly exitingKey: string | null;
  readonly phase: RoutePhase;
  readonly enterMs: number;
  readonly exitMs: number;
}

/**
 * Pure decision, exported so the invariant is testable without a renderer.
 * Reduced motion collapses everything to an instant swap: the *state change* still happens
 * (activeKey moves, old content vanishes), only the choreography goes. That is the
 * feedback-not-suppressed rule applied to routes.
 */
export function crossfade(previousKey: string, nextKey: string, reduced: boolean): RouteTransitionState {
  if (reduced || previousKey === nextKey) {
    return { activeKey: nextKey, exitingKey: null, phase: 'idle', enterMs: 0, exitMs: 0 };
  }
  return {
    activeKey: nextKey,
    exitingKey: previousKey,
    phase: 'enter',
    enterMs: durations.standard,
    exitMs: Math.min(durations.standard, MAX_EXIT_MS),
  };
}

function initial(key: string): RouteTransitionState {
  // First mount of the app is not a transition; animating it would race the hero's own entrance.
  return { activeKey: key, exitingKey: null, phase: 'idle', enterMs: 0, exitMs: 0 };
}

export function useRouteTransition(nextKey: string): RouteTransitionState {
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const [state, setState] = useState<RouteTransitionState>(() => initial(nextKey));

  if (state.activeKey !== nextKey) {
    const c = crossfade(state.activeKey, nextKey, reduced);
    // setState during render re-runs this component before anything is committed — the
    // point is precisely that no intermediate paint of the *old* route or a placeholder
    // occurs. Do not move this into useEffect.
    setState(c);
  }

  useEffect(() => {
    if (state.phase !== 'enter') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // The outgoing layer leaves on exitMs (<= MAX_EXIT_MS), the enter phase settles on
    // enterMs; separate timers because collapsing them would keep a spent route mounted.
    if (state.exitingKey !== null && state.exitMs > 0) {
      timers.push(setTimeout(() => setState((s) => (s.exitingKey === null ? s : { ...s, exitingKey: null })), state.exitMs));
    }
    if (state.enterMs > 0) {
      timers.push(setTimeout(() => setState((s) => (s.phase === 'enter' ? { ...s, phase: 'idle' } : s)), state.enterMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [state.phase, state.enterMs, state.exitMs, state.exitingKey]);

  return state;
}
