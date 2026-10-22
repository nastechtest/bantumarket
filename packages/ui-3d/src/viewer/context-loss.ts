/**
 * Context-loss state machine (07 §4.1 `viewer/`).
 *
 * The browser revokes a GL context under GPU pressure and, by default, you get a black rectangle
 * and no error. Loss is TERMINAL for the session: there is no in-place restore attempt (ADR 0003)
 * because a half-restored context shows a buyer a corrupt render of the item they are about to
 * pay for — and the static path is complete, so the swap costs nothing.
 *
 * `idle → live → lost` and `idle → refused(no-webgl)`. Exactly one transition log: every legal
 * edge is recorded once, illegal attempts are rejected without recording, so the log is an honest
 * audit trail the app can decide what to show from.
 */

export type ContextLossState = 'idle' | 'live' | 'lost' | 'refused';

export interface ContextTransition {
  readonly from: ContextLossState;
  readonly to: ContextLossState;
  readonly reason: string;
  readonly at: number;
}

export interface ContextLossTracker {
  state(): ContextLossState;
  /** idle → live. The Canvas reported created. */
  start(reason?: string): boolean;
  /** idle → refused. The capability probe said there is no usable WebGL. */
  refuse(reason?: string): boolean;
  /** live → lost (also idle → lost if the context dies before onReady lands). Terminal. */
  lose(reason: string): boolean;
  readonly transitions: readonly ContextTransition[];
  subscribe(listener: (transition: ContextTransition) => void): () => void;
}

const LEGAL: Readonly<Partial<Record<ContextLossState, Partial<Record<ContextLossState, true>>>>> = {
  idle: { live: true, refused: true, lost: true },
  live: { lost: true },
};

export function createContextLossTracker(now: () => number = () => Date.now()): ContextLossTracker {
  let current: ContextLossState = 'idle';
  const log: ContextTransition[] = [];
  const listeners = new Set<(transition: ContextTransition) => void>();

  function attempt(to: ContextLossState, reason: string): boolean {
    if (LEGAL[current]?.[to] !== true) return false;
    const transition: ContextTransition = { from: current, to, reason, at: now() };
    current = to;
    log.push(transition);
    for (const listener of listeners) listener(transition);
    return true;
  }

  return {
    state: () => current,
    start: (reason = 'canvas-created') => attempt('live', reason),
    refuse: (reason = 'no-webgl') => attempt('refused', reason),
    lose: (reason) => attempt('lost', reason),
    get transitions(): readonly ContextTransition[] {
      return log;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** True once the session may never render again — the app swaps to the static path for good. */
export function isTerminal(state: ContextLossState): boolean {
  return state === 'lost' || state === 'refused';
}
