import { useCallback, useEffect, useRef } from 'react';
import { isAbortError } from './retry-policy.js';

/**
 * Cancellation (07 §4.1 `loading/`).
 *
 * One scope per viewer instance, and three things can end it: the buyer navigates away, the component
 * unmounts, or the byte guard refuses. All three have to stop geometry already in flight, and the
 * one outcome that is never acceptable is a late response writing into a state that no one is reading
 * — that is how a viewer for item A ends up displaying item B.
 */

export type CancelReason = 'unmount' | 'route-change' | 'byte-budget' | 'manual';

export interface CancellationScope {
  readonly signal: AbortSignal;
  readonly cancelled: boolean;
  readonly reason: CancelReason | null;
  cancel(reason: CancelReason): void;
  /**
   * Resolves to `undefined` if the scope was cancelled at any point, including after the work itself
   * finished. The caller may not use the value without this check, so the check is built into the
   * shape rather than left to discipline.
   */
  settle<T>(work: () => Promise<T>): Promise<T | undefined>;
}

export function createCancellationScope(): CancellationScope {
  const controller = new AbortController();
  let reason: CancelReason | null = null;

  const scope: CancellationScope = {
    get signal() {
      return controller.signal;
    },
    get cancelled() {
      return reason !== null;
    },
    get reason() {
      return reason;
    },
    cancel(why) {
      if (reason !== null) return;
      reason = why;
      controller.abort(new DOMException(`Cancelled: ${why}`, 'AbortError'));
    },
    async settle<T>(work: () => Promise<T>): Promise<T | undefined> {
      // Checked before the work, while it runs, and again after: a response that lands one tick after
      // the buyer left is still a response the buyer never asked to see.
      if (reason !== null) return undefined;
      try {
        const value = await work();
        return reason === null ? value : undefined;
      } catch (error) {
        if (isAbortError(error) || reason !== null) return undefined;
        throw error;
      }
    },
  };
  return scope;
}

/**
 * A live scope that survives React's double-mount.
 *
 * `useRef` keeps one per component instance, but StrictMode unmounts and remounts in development, and
 * a scope aborted by that simulated unmount would poison the real mount that follows it. So the
 * accessor revives the scope whenever the previous one died, which keeps "one token per viewer
 * instance" true without letting a development-only unmount end a production-shaped session.
 */
export interface ViewerCancellation {
  scope(): CancellationScope;
  cancel(reason: CancelReason): void;
}

export function useViewerCancellation(): ViewerCancellation {
  const holder = useRef<{ scope: CancellationScope } | null>(null);
  if (holder.current === null) holder.current = { scope: createCancellationScope() };

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const current = holder.current!;
    // A remount after StrictMode's teardown needs a token that has not already been aborted.
    if (current.scope.cancelled) current.scope = createCancellationScope();
    return () => {
      mounted.current = false;
      current.scope.cancel('unmount');
    };
  }, []);

  const scope = useCallback(() => {
    const current = holder.current!;
    if (current.scope.cancelled) current.scope = createCancellationScope();
    return current.scope;
  }, []);

  const cancel = useCallback((reason: CancelReason) => {
    holder.current?.scope.cancel(reason);
  }, []);

  return { scope, cancel };
}

/**
 * Route changes are the cancellation the buyer does not see coming: the item page they were inspecting
 * is gone, and its geometry is still downloading. `subscribe` is whatever the router offers.
 */
export function cancelOnRouteChange(scope: CancellationScope, subscribe: (onChange: () => void) => () => void): () => void {
  const unsubscribe = subscribe(() => scope.cancel('route-change'));
  return () => {
    unsubscribe();
    scope.cancel('route-change');
  };
}
