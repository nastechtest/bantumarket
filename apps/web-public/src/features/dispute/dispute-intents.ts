/**
 * `intent → Idempotency-Key` for the dispute screen.
 *
 * A key is minted once per deliberate press and kept across retries of *that* press, so a buyer who
 * taps send twice cannot open two disputes; a rejection that will fail identically forever retires the
 * key, so the next deliberate attempt is a genuinely new intent rather than a replay of a doomed one.
 *
 * Same discipline as `@nastech/api-client`'s `IdempotencyKeys`, kept local because that package is
 * being edited elsewhere this wave. CONTRACT-GAP: move this onto the shared implementation once that
 * edit lands — two idempotency caches in one product is how a retry stops being a retry.
 */
export class DisputeIntents {
  private readonly byIntent = new Map<string, string>();
  private readonly generate: () => string;

  constructor(generate?: () => string) {
    this.generate = generate ?? defaultKeyGenerator();
  }

  keyFor(intent: string): string {
    const existing = this.byIntent.get(intent);
    if (existing !== undefined) return existing;
    const created = this.generate();
    this.byIntent.set(intent, created);
    return created;
  }

  release(intent: string): void {
    this.byIntent.delete(intent);
  }

  get size(): number {
    return this.byIntent.size;
  }
}

/**
 * `crypto.randomUUID` when the device has it; otherwise a counter with a random suffix, which is only
 * ever a *within this page* unique key. That is enough here: the server dedupes on the key the same
 * buyer sends twice from the same page, and a page-reload starts a new intent anyway.
 */
function defaultKeyGenerator(): () => string {
  const subtle = (globalThis as { crypto?: Crypto }).crypto;
  if (subtle !== undefined && typeof subtle.randomUUID === 'function') {
    return () => subtle.randomUUID!();
  }
  let counter = 0;
  return () => {
    counter += 1;
    return `local-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  };
}
