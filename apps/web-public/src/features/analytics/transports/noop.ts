/**
 * A transport that does nothing, in three flavours.
 *
 * It exists so "analytics off" is a *wired* state rather than a missing object: the app constructs
 * this when consent was never given, when the build has tracking disabled, or when a buyer refused —
 * and every call site keeps working. The alternative (nullable transport) is how a `?.send()` ends up
 * in a hot path and a future developer "optimises" it away.
 *
 * `beforeConsent()` is the flavour that makes the guarantee testable: it counts what it refused to do,
 * so `consent-gates.test.ts` can assert the no-op path was exercised instead of merely assuming the
 * pipeline was never reached.
 */
import type { Batch, EventTransport, SendResult } from '../transport.js';

export interface NoopTransport extends EventTransport {
  readonly refusedBatches: number;
  readonly refusedEvents: number;
  lastBatch: Batch | null;
}

export function noopTransport(id = 'noop'): NoopTransport {
  let refusedBatches = 0;
  let refusedEvents = 0;
  let lastBatch: Batch | null = null;

  return {
    id,
    async send(batch): Promise<SendResult> {
      refusedBatches += 1;
      refusedEvents += batch.events.length;
      lastBatch = batch;
      // `ok: true` because the batch was handled exactly as configured; reporting failure would make
      // the queue retry a payload whose destination is "nowhere".
      return { ok: true, accepted: 0, via: 'queued' };
    },
    get refusedBatches() {
      return refusedBatches;
    },
    get refusedEvents() {
      return refusedEvents;
    },
    get lastBatch() {
      return lastBatch;
    },
  };
}
