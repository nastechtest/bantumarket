/**
 * Mount/unmount transition helper (07 §5).
 *
 * The smallest thing that lets a component say "I am entering" and "I am leaving" without a
 * React dependency, an animation library or a frame loop. Classes are applied for a timeout
 * window; the caller owns the element and the CSS.
 *
 * Reduced motion is handled here, not by the caller: `motionOk('transition')` is false under
 * the preference, so no class is added, no timer is created and the returned promise resolves
 * immediately with `false`. The state change still happens — it is simply instantaneous.
 *
 * The helper never inspects layout and never waits for `animationend`: jsdom has no animations,
 * and a missing event must not leave a node stuck in an exit class. A timer is the contract.
 */

import { durations } from './tokens.js';
import { motionOk } from './reduced-motion.js';

export const PRESENCE_ENTER_CLASS = 'motion-enter';
export const PRESENCE_EXIT_CLASS = 'motion-exit';

export type PresencePhase = 'idle' | 'entering' | 'exiting';

export interface PresenceOptions {
  /** Class added for the enter window. Defaults to `motion-enter`. */
  readonly enterClass?: string;
  /** Class added for the exit window. Defaults to `motion-exit`. */
  readonly exitClass?: string;
  /** Window length in ms. Defaults to the `standard` token. */
  readonly durationMs?: number;
}

export interface Presence {
  /** Adds the enter class for the window. Resolves `true` when it animated, `false` otherwise. */
  enter(): Promise<boolean>;
  /** Adds the exit class for the window. Resolves `true` when it animated, `false` otherwise. */
  exit(): Promise<boolean>;
  /** True between the class being added and the window closing (or being cancelled). */
  isAnimating(): boolean;
  /** Current phase, for debugging and tests. */
  phase(): PresencePhase;
  /** Cancels any window, removes both classes and resolves the pending promise with `false`. */
  dispose(): void;
}

export function createPresence(element: Element, options: PresenceOptions = {}): Presence {
  const enterClass = options.enterClass ?? PRESENCE_ENTER_CLASS;
  const exitClass = options.exitClass ?? PRESENCE_EXIT_CLASS;
  const requested = options.durationMs ?? durations.standard;
  // A negative, NaN or zero window is not an animation; treat it as the reduced-motion path.
  const durationMs = Number.isFinite(requested) && requested > 0 ? requested : 0;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveCurrent: ((animated: boolean) => void) | null = null;
  let current: PresencePhase = 'idle';

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    element.classList.remove(enterClass);
    element.classList.remove(exitClass);
    current = 'idle';
    if (resolveCurrent !== null) {
      const resolve = resolveCurrent;
      resolveCurrent = null;
      resolve(false);
    }
  }

  function begin(next: 'entering' | 'exiting', addClass: string): Promise<boolean> {
    // A new direction supersedes the old one; the pending caller must not hang.
    cancel();
    if (!motionOk('transition') || durationMs === 0) return Promise.resolve(false);

    element.classList.add(addClass);
    current = next;
    return new Promise<boolean>((resolve) => {
      resolveCurrent = resolve;
      timer = setTimeout(() => {
        element.classList.remove(addClass);
        timer = null;
        resolveCurrent = null;
        current = 'idle';
        resolve(true);
      }, durationMs);
    });
  }

  return {
    enter: () => begin('entering', enterClass),
    exit: () => begin('exiting', exitClass),
    isAnimating: () => current !== 'idle',
    phase: () => current,
    dispose: cancel,
  };
}
