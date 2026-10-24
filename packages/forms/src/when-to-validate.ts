/**
 * When a field may be validated.
 *
 * The policy this package exists to enforce, because every app would otherwise pick a different one:
 *
 *  - Never on the first keystroke of a field the user has not left yet. `4` is not an invalid phone
 *    number, it is an unfinished one, and a form that says otherwise teaches the user to distrust it.
 *  - Blur first, then change. Once a field has been blurred (`touched`), every change re-validates it,
 *    so a fix clears the error immediately.
 *  - Expensive rules — anything marked `expensive` in its result, which in practice is a remote
 *    check — run on blur and on submit only, never on change. A debounced remote rule is still a
 *    remote rule per keystroke with a nicer name.
 *  - Submit validates everything, touched or not, and focuses the first error.
 *
 * `validateOn` returns *what to run*, not whether to render: a `change` decision that skips an
 * expensive rule still re-runs the cheap ones, so a user who fixes the length of a password sees
 * that error clear even though the denylist check is deferred.
 */

export type ValidationTrigger = 'change' | 'blur' | 'submit' | 'server_response' | 'mount';

export interface ValidationDecision {
  readonly run: boolean;
  readonly includeExpensive: boolean;
  readonly reason: 'first_keystroke' | 'untouched' | 'expensive_deferred' | 'run' | 'submit';
}

export interface TimingInput {
  readonly trigger: ValidationTrigger;
  /** Has this field been blurred at least once? */
  readonly touched: boolean;
  /** Has this field produced an error yet (from any origin)? */
  readonly hasError: boolean;
  /** Number of keystrokes since the field was touched — 0 means the change that follows a blur. */
  readonly changesSinceTouch: number;
  readonly expensivePending?: boolean;
}

export function validateOn(input: TimingInput): ValidationDecision {
  switch (input.trigger) {
    case 'submit':
      return { run: true, includeExpensive: true, reason: 'submit' };

    case 'blur':
    case 'server_response':
      return { run: true, includeExpensive: true, reason: 'run' };

    case 'mount':
      // A prefilled checkout or an edit-listing form must show server-side problems it already knows
      // about, but must not invent client errors for a field nobody has touched.
      return { run: input.hasError, includeExpensive: false, reason: input.hasError ? 'run' : 'untouched' };

    case 'change':
      if (!input.touched) return { run: false, includeExpensive: false, reason: 'untouched' };
      if (!input.hasError && input.changesSinceTouch === 0) {
        return { run: false, includeExpensive: false, reason: 'first_keystroke' };
      }
      return { run: true, includeExpensive: false, reason: input.expensivePending ? 'expensive_deferred' : 'run' };
  }
}

/**
 * The cheap, synchronous guard a component calls before scheduling work. `true` means "call
 * `useForm`'s validate"; the hook decides the rest.
 */
export function shouldValidateOnChange(touched: boolean, hasError: boolean, changesSinceTouch: number): boolean {
  return validateOn({ trigger: 'change', touched, hasError, changesSinceTouch }).run;
}

/**
 * Whether a field's error may be *shown*. Distinct from whether it was computed: an untouched field
 * with a server error from a previous submit shows it (the server said so); an untouched field with
 * a client error does not (we computed it for a value the user has not finished typing).
 */
export function canShowError(input: {
  readonly touched: boolean;
  readonly submitted: boolean;
  readonly origin: 'client' | 'server';
}): boolean {
  if (input.submitted) return true;
  if (input.origin === 'server') return true;
  return input.touched;
}

/** Debounce only applies to cheap rules; see the module header for why expensive ones are deferred outright. */
export const CHANGE_DEBOUNCE_MS = 250;

export interface DebouncedSchedule {
  readonly schedule: (run: () => void) => void;
  readonly cancel: () => void;
  readonly flush: () => void;
}

/**
 * Injectable clock so the policy is testable without real timers.
 * `setTimeout`/`clearTimeout` are passed in rather than called here: this file must stay free of
 * environment assumptions so web-staff can run it under the same tests as web-public.
 */
export function createDebouncer(
  timers: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void },
  ms = CHANGE_DEBOUNCE_MS,
): DebouncedSchedule {
  let handle: unknown = undefined;
  let queued: (() => void) | undefined;
  return {
    schedule(run) {
      if (handle !== undefined) timers.clearTimeout(handle);
      queued = run;
      handle = timers.setTimeout(() => {
        handle = undefined;
        const fn = queued;
        queued = undefined;
        fn?.();
      }, ms);
    },
    cancel() {
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = undefined;
      queued = undefined;
    },
    flush() {
      if (handle !== undefined) timers.clearTimeout(handle);
      handle = undefined;
      const fn = queued;
      queued = undefined;
      fn?.();
    },
  };
}
