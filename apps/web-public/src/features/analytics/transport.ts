/**
 * The transport seam and the envelope shape.
 *
 * Two decisions in this file, both POPIA-facing rather than architectural:
 *
 *  · **Every envelope carries the permission it was written under** (`consentVersion`,
 *    `noticeVersion`, `sessionEpoch`). "We only processed consented data" is a claim about rows, and a
 *    row that cannot show its own basis is not evidence of one — POPIA s11(3)(b) lets a data subject
 *    withdraw, and the withdrawal has to be locatable in the data, not in a changelog nobody reads.
 *  · **Nothing in the payload identifies the sender beyond that session.** No IP, no user agent, no
 *    cookies, no device fields, no `client_id` a third party could set. Where the rotation guarantee
 *    lives (`session.ts`), the payload is what proves it held: if a field is not in
 *    `EventEnvelope`, a feature cannot send it.
 */
import type { ConsentCategory } from '../../lib/consent/types.js';
import type { EventName, EventPropsMap } from './events.js';

/** An event for a specific name; `props` is narrowed so a call site cannot pass the wrong shape. */
export type AnyEvent = { readonly [E in EventName]: { name: E; props: EventPropsMap[E] } }[EventName];

export interface EventEnvelope<E extends EventName = EventName> {
  readonly name: E;
  readonly category: ConsentCategory;
  /** Epoch ms when the *thing happened*, not when it was flushed. Queueing must not rewrite history. */
  readonly occurredAt: number;
  /** Epoch ms when the row left the queue. The gap is queue latency and is worth measuring. */
  readonly emmittedAt?: number;
  readonly sessionId: string;
  readonly sessionEpoch: number;
  readonly consentVersion: number;
  readonly noticeVersion: string;
  readonly appId: 'web-public';
  readonly props: EventPropsMap[E];
  /** First-touch only, attached on the events of the session that captured it. See `attribution.ts`. */
  readonly firstTouch?: FirstTouchEnvelope;
}

export interface FirstTouchEnvelope {
  readonly sourceHost: string;
  readonly landingRoutePattern: string;
  readonly capturedAt: number;
}

export interface Batch {
  readonly schemaVersion: 1;
  readonly appId: 'web-public';
  /** Random per batch, never reused: lets the server dedupe a retry without becoming a tracking id. */
  readonly batchId: string;
  readonly flushReason: FlushReason;
  readonly sentAt: number;
  readonly consentVersion: number;
  readonly noticeVersion: string;
  readonly events: readonly EventEnvelope[];
}

/**
 * Why a batch left the queue. The gateway picks its sending mechanism from this: a `pagehide` batch
 * is the one that has to go out on `sendBeacon`, because a `fetch` started during unload is a fetch
 * the browser is allowed to cancel — and losing the last batch of a session is how you get a funnel
 * whose final step always looks like abandonment.
 */
export type FlushReason = 'batch_full' | 'timer' | 'visibility_hidden' | 'pagehide' | 'manual' | 'withdrawal' | 'shutdown';

export type SendResult =
  | { readonly ok: true; readonly accepted: number; readonly via: 'fetch' | 'beacon' | 'queued' }
  | { readonly ok: false; readonly kind: SendFailure; readonly retryable: boolean };

export type SendFailure =
  /** Offline, DNS, aborted. No events are recovered from this; they stay queued if the page lives. */
  | 'network'
  /** The gateway refused the payload (too large, malformed, unsupported schema version). */
  | 'rejected'
  /** The batch exceeded the byte cap and was dropped rather than split. See `MAX_BATCH_BYTES`. */
  | 'oversize'
  /**
   * Refused by the transport itself because the consent record behind the batch no longer permits it
   * — the last-ditch check on the flush path, after `queue.discardCategory` should have emptied it.
   */
  | 'consent_revoked';

export interface EventTransport {
  readonly id: string;
  send(batch: Batch): Promise<SendResult>;
  /** Called once on teardown so a dev transport can drop timers; the noop transport ignores it. */
  close?(): void;
}

/**
 * 56 KB is under the 64 KB `sendBeacon` payload ceiling on Chrome and comfortably under the
 * common 32 KB-per-request body limits on the reverse proxies a South African hosting stack uses.
 * A batch bigger than this is dropped, not split: splitting a withdrawal-time flush across requests
 * is how some refused events survive.
 */
export const MAX_BATCH_BYTES = 56_000;

export const BATCH_SCHEMA_VERSION = 1 as const;

export function estimateBatchBytes(batch: Batch): number {
  // Not a length of the JSON string: a UTF-16 length would understate a payload containing an
  // emoji-laden route name. This is a byte count of the actual wire form, which is what the cap is about.
  return new TextEncoder().encode(JSON.stringify(batch)).length;
}

/**
 * Defence in depth for anything that builds a batch outside `queue.ts` (a dev console call, a future
 * importer): refuse a batch that carries an envelope whose category is not consented *right now*.
 * Returns the offending event names so the caller can log them.
 */
export function batchConsentMismatches(
  batch: Batch,
  allowed: (category: ConsentCategory) => boolean,
): string[] {
  const bad: string[] = [];
  for (const e of batch.events) {
    if (e.category === 'essential') continue;
    if (!allowed(e.category)) bad.push(e.name);
  }
  return bad;
}
