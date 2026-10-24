/**
 * Cancellation: one scope per page, one child scope per component, and a rule that an aborted
 * request is never a failure.
 *
 * Two leaks this closes. The first is telemetry noise: a buyer who taps back while a search is in
 * flight cancelled a request, they did not experience an error, and a build that reports the abort
 * as a failure makes the pilot's error budget a lie. The second is the unmounted component: a
 * response that lands after `useEffect` cleanup would call `setState` on a tree that no longer
 * exists, which React 18 warns about and which worse — in a checkout screen — writes fresh money
 * numbers into a dead form.
 *
 * The reason for a cancelled request is carried on the scope, not inferred from a DOMException:
 * `navigation`, `unmount`, `superseded`, `manual` and `timeout` have different consequences, and
 * only `timeout` is a user-visible problem.
 */

export type AbortReason = 'navigation' | 'unmount' | 'superseded' | 'manual' | 'timeout';

/**
 * Thrown in place of an ApiError when a request was cancelled by this layer. Deliberately NOT an
 * `ApiError`: every call site that catches the closed taxonomy in `errors.js` then passes a
 * cancellation straight through to whatever handles real failures, which is the behaviour we want
 * to make impossible. Handle `RequestAborted` first or use `isReportableFailure`.
 */
export class RequestAborted extends Error {
  readonly reason: AbortReason;
  readonly scopeId: string;

  constructor(reason: AbortReason, scopeId: string) {
    // Static message: a cancellation knows nothing about the request, and the path could be a
    // signed URL whose query is the secret.
    super('This request was cancelled before it completed.');
    this.name = 'RequestAborted';
    this.reason = reason;
    this.scopeId = scopeId;
  }
}

export function isRequestAborted(value: unknown): value is RequestAborted {
  return value instanceof RequestAborted;
}

/** Cancelled because the user left — the exact case that must never count as a failure. */
export function isNavigationAbort(value: unknown): boolean {
  return value instanceof RequestAborted && value.reason === 'navigation';
}

/**
 * Everything a UI or a telemetry sink may treat as a failure. Cancellations are excluded by
 * reason, not by class: a `timeout` abort is this layer giving up on a hung server and *is* a
 * reportable event, while a scope cancellation is not.
 */
export function isReportableFailure(value: unknown): boolean {
  if (value instanceof RequestAborted) return false;
  if (value instanceof Error && value.name === 'TimeoutError' && isAbortSignalTimeout(value)) return false;
  return true;
}

/**
 * A scope: an AbortController plus the reason it was cancelled and its children. `signal` is what
 * goes to fetch; `reason` is what the layer reports.
 */
export interface AbortScope {
  readonly id: string;
  readonly signal: AbortSignal;
  /** Set once cancelled; `undefined` while the scope is live. */
  readonly reason: AbortReason | undefined;
  readonly parent: AbortScope | undefined;
  /** A child dies with its parent, with the parent's reason. Component-level scopes use this. */
  child(id?: string): AbortScope;
  cancel(reason?: AbortReason): void;
  isActive(): boolean;
  /**
   * Attach this scope to a promise: if the scope is cancelled first, the returned promise rejects
   * with `RequestAborted`. The underlying promise is never abandoned without an owner — a
   * rejection that arrives after we stopped waiting is swallowed here rather than logged as
   * unhandled.
   */
  guard<T>(promise: Promise<T>): Promise<T>;
}

/**
 * `reason` travels with the signal, not with the scope object, because the terminal fetch layer
 * only ever holds the signal. A WeakMap keeps that association invisible to anything that clones
 * or serialises the scope.
 */
const reasonBySignal = new WeakMap<AbortSignal, AbortReason>();
const timeoutMarker = new WeakSet<AbortSignal>();

function abortSignalTimeoutMarker(signal: AbortSignal): boolean {
  return timeoutMarker.has(signal);
}

function isAbortSignalTimeout(error: Error): boolean {
  return (error as Error & { __nastechTimeout?: boolean }).__nastechTimeout === true;
}

export function abortReasonOf(signal: AbortSignal | undefined): AbortReason | undefined {
  return signal === undefined ? undefined : reasonBySignal.get(signal);
}

export function scopeOfSignal(signal: AbortSignal): string | undefined {
  return signalScopeIds.get(signal);
}

const signalScopeIds = new WeakMap<AbortSignal, string>();

class Scope implements AbortScope {
  readonly id: string;
  readonly parent: AbortScope | undefined;
  private readonly controller: AbortController;
  private readonly children: Scope[] = [];
  private cancelledWith: AbortReason | undefined;
  private childSeq = 0;

  constructor(id: string, parent?: Scope) {
    this.id = id;
    this.parent = parent;
    this.controller = new AbortController();
    signalScopeIds.set(this.controller.signal, id);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get reason(): AbortReason | undefined {
    return this.cancelledWith;
  }

  isActive(): boolean {
    return !this.controller.signal.aborted;
  }

  child(id?: string): AbortScope {
    this.childSeq += 1;
    const created = new Scope(id ?? `${this.id}#${this.childSeq}`, this);
    if (this.cancelledWith !== undefined) {
      // A child minted after the parent died is born dead: a component that mounts into an
      // abandoned page must not get a live signal and then wonder why nothing cancels it.
      created.cancel(this.cancelledWith);
    } else {
      this.children.push(created);
    }
    return created;
  }

  cancel(reason: AbortReason = 'manual'): void {
    if (this.cancelledWith !== undefined) return;
    this.cancelledWith = reason;
    reasonBySignal.set(this.controller.signal, reason);
    this.controller.abort(new RequestAborted(reason, this.id));
    // Children are cancelled with the parent's reason, so a page teardown reads as one
    // navigation for every request the page owned.
    for (const child of this.children) child.cancel(reason);
  }

  guard<T>(promise: Promise<T>): Promise<T> {
    if (this.controller.signal.aborted) {
      // Hand the platform an owner for the in-flight rejection either way.
      promise.catch(() => {});
      return Promise.reject(new RequestAborted(abortReasonOf(this.controller.signal) ?? 'manual', this.id));
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        reject(new RequestAborted(abortReasonOf(this.controller.signal) ?? 'manual', this.id));
      };
      this.controller.signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          this.controller.signal.removeEventListener('abort', onAbort);
          // A response that lands after cancellation is dropped here rather than delivered to a
          // caller that has stopped caring — the unmount-without-setState guarantee.
          if (!this.controller.signal.aborted) resolve(value);
        },
        (error) => {
          this.controller.signal.removeEventListener('abort', onAbort);
          if (!this.controller.signal.aborted) reject(error);
        },
      );
    });
  }
}

export function createAbortScope(id = 'root'): AbortScope {
  return new Scope(id);
}

/**
 * Per-route cancellation. One scope is live at a time; entering a route cancels whatever the
 * previous route still had in flight with reason `navigation`, and every component on the new
 * route shares the entered scope so a second `enter()` kills them together.
 */
export class RouteScopes {
  private current: Scope | undefined;
  private seq = 0;

  get active(): AbortScope | undefined {
    return this.current;
  }

  enter(routeKey: string): AbortScope {
    this.seq += 1;
    if (this.current !== undefined) this.current.cancel('navigation');
    const next = new Scope(`${routeKey}#${this.seq}`);
    this.current = next;
    return next;
  }

  /** Cancels the live scope without starting one — a sign-out, an offline wall, a hard teardown. */
  cancelActive(reason: AbortReason = 'manual'): void {
    this.current?.cancel(reason);
  }

  dispose(): void {
    this.current?.cancel('unmount');
    this.current = undefined;
  }
}

/**
 * A deadline that is a *cancellation*, not an error: the timeouts middleware uses this so a slow
 * server produces the same typed `timeout` ApiError whatever transport sits underneath, while a
 * caller cancellation keeps its own reason. The returned signal is what reaches fetch.
 */
export interface DeadlineSignal {
  readonly signal: AbortSignal;
  timedOut(): boolean;
  /** Removes the listener and the timer. Must be called in a `finally`. */
  release(): void;
}

export function withDeadline(
  upstream: AbortSignal | undefined,
  timeoutMs: number,
  onTimeout: (signal: AbortSignal) => void = () => {},
): DeadlineSignal {
  const controller = new AbortController();
  let timedOut = false;
  const markTimeout = (): void => {
    timedOut = true;
    timeoutMarker.add(controller.signal);
    reasonBySignal.set(controller.signal, 'timeout');
    if (!controller.signal.aborted) controller.abort(timeoutError());
    onTimeout(controller.signal);
  };
  const timer = setTimeout(markTimeout, Math.max(0, timeoutMs));
  const onUpstreamAbort = (): void => {
    const reason = abortReasonOf(upstream) ?? 'manual';
    reasonBySignal.set(controller.signal, reason);
    if (!controller.signal.aborted) {
      controller.abort(upstream?.reason ?? new RequestAborted(reason, 'caller'));
    }
  };
  if (upstream !== undefined) {
    if (upstream.aborted) onUpstreamAbort();
    else upstream.addEventListener('abort', onUpstreamAbort, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    release: () => {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', onUpstreamAbort);
    },
  };
}

function timeoutError(): Error & { __nastechTimeout?: boolean } {
  const error = new Error('Request deadline exceeded.') as Error & { __nastechTimeout?: boolean };
  error.name = 'TimeoutError';
  error.__nastechTimeout = true;
  return error;
}

/** True when a signal was aborted by our own deadline rather than by a caller. */
export function isTimeoutSignal(signal: AbortSignal | undefined): boolean {
  if (signal === undefined) return false;
  if (abortSignalTimeoutMarker(signal)) return true;
  return abortReasonOf(signal) === 'timeout';
}
