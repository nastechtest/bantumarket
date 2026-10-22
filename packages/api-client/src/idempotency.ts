/**
 * Idempotency keys: one key per user intent, reused across every retry of that intent.
 *
 * The PHP side treats a spent key as "this exact request already happened" (the payout ledger is
 * keyed by a unique index on `idempotency_key`; orders will be no different once the HTTP layer
 * exists). So the client's job is narrow and absolute: a double-tapped "Buy" must present the
 * same key on its second attempt — a fresh key per attempt converts a double-tap into two
 * orders, which is the exact money bug this module exists to prevent.
 */

export type IntentId = string;

export function generateIdempotencyKey(): string {
  const uuid = globalThis.crypto;
  if (uuid && typeof uuid.randomUUID === 'function') return uuid.randomUUID();
  // Non-secure-context HTTP (or an old WebKit) has no randomUUID. The key only has to be
  // unique per intent and unguessable-ish; a counter+entropy fallback keeps the reuse
  // semantics intact, which is what actually matters.
  return `ik-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class IdempotencyKeys {
  private readonly byIntent = new Map<IntentId, string>();

  /**
   * The key for this intent. First call mints and remembers it; every later call — a retry, a
   * re-render, a second tap of the same debounced button — gets the identical string back.
   */
  keyForIntent(intent: IntentId): string {
    const existing = this.byIntent.get(intent);
    if (existing !== undefined) return existing;
    const key = generateIdempotencyKey();
    this.byIntent.set(intent, key);
    return key;
  }

  /**
   * The intent reached a settled outcome and a repeat of it is now a *new* intent — release its
   * key so the next mint is fresh. Callers must NOT release on retryable failures (network,
   * timeout, providerUnavailable): the server may already have done the work under that key,
   * and a new key on the retry is precisely the double-order bug.
   */
  releaseIntent(intent: IntentId): void {
    this.byIntent.delete(intent);
  }

  /** Diagnostic for tests and dev tooling; never contains response material. */
  pendingIntents(): readonly IntentId[] {
    return [...this.byIntent.keys()];
  }
}

/**
 * Stable intent id for "the buyer tapped buy on this listing in this session, at this tap".
 * The UI owns the tap nonce (e.g. incremented per deliberate press); the client only guarantees
 * that the same nonce always replays the same key. Two different nonces are two intents — that
 * is a deliberate second purchase, and it earns a fresh key.
 */
export function orderIntent(listingId: string, tapNonce: string | number): IntentId {
  return `order:${listingId}:${String(tapNonce)}`;
}
