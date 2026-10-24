/**
 * Submit guard: one in-flight submit, and a way back out of it.
 *
 * Two failures this exists to prevent, both of which cost money on a marketplace:
 *
 *  1. **Double submit.** Two taps on "Pay" against the PHP ledger is two `PAID` rows or a lost
 *     refund. The guard is a token compare, not a disabled attribute — a disabled button is a *UI*
 *     claim about state, and the state can change between the click handler and the render.
 *  2. **The disabled-with-no-way-back form.** A submit that fails validation after the button was
 *     optimistically disabled must re-enable it. Anything else leaves a seller staring at a grey
 *     button with an error they can fix, and a fixed error that cannot be resubmitted is a lost sale.
 *     So `fail()` releases the token *and* records why, and `canSubmit()` is the only question the
 *     button is allowed to ask.
 *
 * The idempotency key is minted per *attempt* and survives a network retry of that attempt: a retry
 * of the same click must send the same key, but a new click after a failure is a new intent and gets
 * a new one.
 */

export interface SubmitGuardOptions {
  /** Injectable clock for tests; production passes `() => Date.now()`. */
  readonly now?: () => number;
  readonly mintKey?: () => string;
}

export type ReleaseReason =
  | 'succeeded'
  | 'validation_failed'
  | 'server_error'
  | 'network_error'
  | 'abandoned'
  | 'superseded';

export interface GuardSnapshot {
  readonly inFlight: boolean;
  readonly token: number;
  readonly idempotencyKey?: string | undefined;
  readonly canSubmit: boolean;
  readonly lastReleaseReason?: ReleaseReason | undefined;
  /** Seconds since the last failure; a form that failed 20 times should not be re-enabled instantly. */
  readonly cooldownUntil?: number | undefined;
}

let counter = 0;

/** Not a React thing on purpose: the page component owns the hook, this owns the money path. */
export function createSubmitGuard(options: SubmitGuardOptions = {}): SubmitGuard {
  const now = options.now ?? (() => Date.now());
  const mintKey =
    options.mintKey ??
    (() => {
      counter += 1;
      // `crypto.randomUUID` is available in every runtime that renders this app; a counter keeps the
      // guard testable in plain bun without a Web Crypto dependency.
      return `attempt-${now().toString(36)}-${counter.toString(36)}`;
    });

  let token = 0;
  let inFlight = false;
  let idempotencyKey: string | undefined;
  let lastReleaseReason: ReleaseReason | undefined;
  let cooldownUntil: number | undefined;

  const guard: SubmitGuard = {
    tryStart(): StartPermit | undefined {
      if (inFlight) return undefined;
      inFlight = true;
      token += 1;
      idempotencyKey = mintKey();
      cooldownUntil = undefined;
      lastReleaseReason = undefined;
      return { token: token, idempotencyKey: idempotencyKey, release: (reason) => guard.release(token, reason) };
    },

    release(expectedToken: number, reason: ReleaseReason): boolean {
      // A stale promise from a submit that was already released must not re-enable a live one.
      if (!inFlight || expectedToken !== token) return false;
      inFlight = false;
      lastReleaseReason = reason;
      idempotencyKey = undefined;
      if (reason === 'validation_failed' || reason === 'server_error' || reason === 'network_error') {
        // Deliberately no cooldown: the user has to be able to press the button again now.
        cooldownUntil = undefined;
      }
      return true;
    },

    isCurrent(permitToken: number): boolean {
      return inFlight && permitToken === token;
    },

    canSubmit(): boolean {
      if (inFlight) return false;
      if (cooldownUntil !== undefined && now() < cooldownUntil) return false;
      return true;
    },

    snapshot(): GuardSnapshot {
      return {
        inFlight,
        token,
        idempotencyKey,
        canSubmit: guard.canSubmit(),
        lastReleaseReason,
        cooldownUntil,
      };
    },

    /** Call on unmount / route change so a navigated-away submit cannot be "still in flight" forever. */
    abandon(): void {
      if (inFlight) {
        inFlight = false;
        lastReleaseReason = 'abandoned';
        token += 1; // any promise still holding the old permit is now stale
        idempotencyKey = undefined;
      }
    },

    /**
     * Re-attach to the in-flight attempt after a component remount (hot reload, route re-entry).
     * Returns the same key so the transport can keep the request rather than start a second intent.
     */
    currentKey(): string | undefined {
      return inFlight ? idempotencyKey : undefined;
    },
  };

  return guard;
}

export interface StartPermit {
  readonly token: number;
  readonly idempotencyKey: string;
  readonly release: (reason: ReleaseReason) => boolean;
}

export interface SubmitGuard {
  tryStart(): StartPermit | undefined;
  release(expectedToken: number, reason: ReleaseReason): boolean;
  isCurrent(token: number): boolean;
  canSubmit(): boolean;
  snapshot(): GuardSnapshot;
  abandon(): void;
  currentKey(): string | undefined;
}

/**
 * Run `submit` under the guard. Returns `null` when the submit was refused because one is already
 * in flight — which is the correct answer for a double tap, and is why the return is not a boolean.
 *
 * `validate` runs *inside* the guard, after the optimistic disable, so the required
 * "validation failure re-enables the button" path is the normal path and not a special case.
 */
export async function guardedSubmit<T>(
  guard: SubmitGuard,
  submit: (idempotencyKey: string) => Promise<T>,
  hooks: {
    readonly validate?: () => boolean | Promise<boolean>;
    readonly onSuccess?: (value: T, idempotencyKey: string) => void | Promise<void>;
    readonly onError?: (error: unknown, reason: ReleaseReason) => void;
  } = {},
): Promise<T | null> {
  const permit = guard.tryStart();
  if (permit === undefined) return null;

  let valid: boolean;
  try {
    valid = hooks.validate === undefined ? true : await hooks.validate();
  } catch {
    permit.release('validation_failed');
    return null;
  }
  if (!valid) {
    permit.release('validation_failed');
    return null;
  }

  try {
    const value = await submit(permit.idempotencyKey);
    // The await may have outlived this attempt (abandon/superseded); only release if still current.
    if (!guard.isCurrent(permit.token)) {
      hooks.onError?.(new Error('superseded'), 'superseded');
      return value;
    }
    permit.release('succeeded');
    await hooks.onSuccess?.(value, permit.idempotencyKey);
    return value;
  } catch (error) {
    const reason: ReleaseReason = isServerError(error) ? 'server_error' : 'network_error';
    permit.release(reason);
    hooks.onError?.(error, reason);
    return null;
  }
}

/** Anything with a 4xx/5xx-ish `status` is the server answering; everything else is the network. */
export function isServerError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = (error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400;
}
