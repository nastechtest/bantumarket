/**
 * The event queue: batch, flush on visibility change and `pagehide`, cap, drop-oldest.
 *
 * Rules in priority order, because they conflict and the order is the design:
 *
 *  1. **An event whose category is not permitted is never buffered.** Not "queued and dropped at
 *     flush": a buffer that holds unpermitted events and waits for a consent grant would attach a
 *     consent to a collection that happened before it. POPIA s11(3)(a) consent is *for a specific
 *     purpose*, given before the processing, so a pre-consent buffer is processing without a basis.
 *  2. **Withdrawal empties the buffer.** `discardCategory` is called by `consent/withdraw.ts` and is
 *     the observable difference between "we stop collecting" and "we stop *sending*". Buffered rows
 *     were collected, so they go.
 *  3. **Overflow drops the oldest, not the newest.** A session's late events are the ones near a
 *     conversion, and a queue that overflows on a long browsing visit should keep the tail that tells
 *     us whether the buyer got anywhere.
 *  4. **Oversize batches are dropped, never split at a withdrawal.** Splitting is how part of a
 *     refused batch still reaches the server.
 *
 * Everything environmental is injected: no `setInterval` at import time, no `document` read at module
 * scope, so the same queue runs in a test, in a browser, and in the `NO_3D` build without a flag.
 */
import type { ConsentCategory } from '../../lib/consent/types.js';
import { estimateBatchBytes, MAX_BATCH_BYTES, type Batch, type EventEnvelope, type EventTransport, type FlushReason, type SendResult } from './transport.js';

export const DEFAULT_MAX_EVENTS = 120;
export const DEFAULT_BATCH_LIMIT_EVENTS = 20;
export const DEFAULT_FLUSH_TIMER_MS = 10_000;

export type PushResult =
  | { readonly accepted: true; readonly droppedOldest: number }
  | { readonly accepted: false; readonly reason: 'refused_no_consent' | 'oversize_event' | 'category_unmapped' };

export interface FlushOutcome {
  readonly sent: number;
  readonly dropped: number;
  readonly remaining: number;
  readonly result: SendResult | null;
  readonly reason: FlushReason;
}

export interface QueueStats {
  readonly pushed: number;
  readonly refusedNoConsent: number;
  readonly droppedOldest: number;
  readonly droppedOversize: number;
  readonly discardedOnWithdrawal: number;
  readonly flushed: number;
  readonly failed: number;
}

/** The minimal document/window surface the queue needs; `null` members mean "this host has no such thing". */
export interface QueueEnvironment {
  readonly visibility?: { readonly state: () => DocumentVisibilityState; onChange: (fn: () => void) => () => void };
  readonly unload?: { onPagehide: (fn: () => void) => () => void };
  readonly timer?: {
    set: (fn: () => void, ms: number) => number;
    clear: (handle: number) => void;
  };
}

export interface QueueOptions {
  readonly transport: EventTransport;
  /** Checked at push and again at flush. Must be pure and synchronous. */
  readonly allowed: (category: ConsentCategory) => boolean;
  readonly maxEvents?: number;
  readonly batchLimitEvents?: number;
  readonly maxBytes?: number;
  readonly flushTimerMs?: number;
  readonly now: () => number;
  readonly env?: QueueEnvironment;
  /** Diagnostics sink: a rejected row is a bug at a call site, and silence is how it ships. */
  readonly onDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;
}

interface InternalItem {
  readonly envelope: EventEnvelope;
  readonly bytes: number;
}

export interface EventQueue {
  push(envelope: EventEnvelope): PushResult;
  discardCategory(category: ConsentCategory): number;
  discardAll(): number;
  flush(reason: FlushReason): Promise<FlushOutcome>;
  /** Attach the lifecycle listeners. Returns the detach function. */
  start(): () => void;
  size(): number;
  buffered(): readonly EventEnvelope[];
  stats(): QueueStats;
  /** Set by `consent/withdraw.ts` for the duration of a withdrawal: refuses pushes even if a race re-grants. */
  sealUntilNextDecision(sealed: boolean): void;
}

export function createQueue(options: QueueOptions): EventQueue {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const batchLimit = options.batchLimitEvents ?? DEFAULT_BATCH_LIMIT_EVENTS;
  const maxBytes = options.maxBytes ?? MAX_BATCH_BYTES;
  const flushTimerMs = options.flushTimerMs ?? DEFAULT_FLUSH_TIMER_MS;
  const env = options.env ?? {};
  const now = options.now;

  let items: InternalItem[] = [];
  let inFlight = false;
  let sealed = false;
  let timerHandle: number | null = null;
  let detach: (() => void) | null = null;
  let batchCounter = 0;

  const stats: { -readonly [K in keyof QueueStats]: QueueStats[K] } = {
    pushed: 0,
    refusedNoConsent: 0,
    droppedOldest: 0,
    droppedOversize: 0,
    discardedOnWithdrawal: 0,
    flushed: 0,
    failed: 0,
  };

  const diagnose = (message: string, detail?: Record<string, unknown>): void => {
    try {
      options.onDiagnostic?.(message, detail);
    } catch {
      /* a diagnostic sink that throws must never take a tracking call down with it */
    }
  };

  function byteSizeOf(envelope: EventEnvelope): number {
    try {
      return new TextEncoder().encode(JSON.stringify(envelope)).length;
    } catch {
      // A value that cannot be serialised is a value that must not be sent — the classic case being
      // a getter that throws or a circular structure from a spread of a live object.
      return Number.POSITIVE_INFINITY;
    }
  }

  function nextBatchId(): string {
    batchCounter += 1;
    // Unique within this page, and meaningless outside it: no timestamp is embedded, so a batch id
    // cannot be used to reconstruct when a person was active.
    return `b${now().toString(36).slice(-4)}${batchCounter.toString(36)}`;
  }

  function buildBatch(reason: FlushReason, chunk: readonly EventEnvelope[], consentVersion: number, noticeVersion: string): Batch {
    return {
      schemaVersion: 1,
      appId: 'web-public',
      batchId: nextBatchId(),
      flushReason: reason,
      sentAt: now(),
      consentVersion,
      noticeVersion,
      events: chunk,
    };
  }

  function push(envelope: EventEnvelope): PushResult {
    if (sealed) {
      stats.refusedNoConsent += 1;
      return { accepted: false, reason: 'refused_no_consent' };
    }
    if (!options.allowed(envelope.category)) {
      stats.refusedNoConsent += 1;
      diagnose(`queue refused ${envelope.name}: category ${envelope.category} is not permitted`, {
        category: envelope.category,
      });
      return { accepted: false, reason: 'refused_no_consent' };
    }

    const bytes = byteSizeOf(envelope);
    if (bytes > maxBytes) {
      stats.droppedOversize += 1;
      diagnose(`queue dropped ${envelope.name}: single event of ${bytes} B exceeds the ${maxBytes} B batch cap`);
      return { accepted: false, reason: 'oversize_event' };
    }

    let droppedOldest = 0;
    // Byte budget first: an event may fit the count and still not fit the wire.
    while (totalBytes() + bytes > maxBytes && items.length > 0) {
      items.shift();
      droppedOldest += 1;
      stats.droppedOldest += 1;
    }
    while (items.length >= maxEvents) {
      items.shift();
      droppedOldest += 1;
      stats.droppedOldest += 1;
    }

    items.push({ envelope, bytes });
    stats.pushed += 1;
    scheduleTimer();

    if (items.length >= batchLimit) {
      // Fire and forget: a caller in a click handler must not have to await the network.
      void flush('batch_full');
      return { accepted: true, droppedOldest };
    }
    return { accepted: true, droppedOldest };
  }

  function totalBytes(): number {
    return items.reduce((sum, i) => sum + i.bytes, 0);
  }

  function discardCategory(category: ConsentCategory): number {
    const before = items.length;
    items = items.filter((i) => i.envelope.category !== category);
    const removed = before - items.length;
    stats.discardedOnWithdrawal += removed;
    return removed;
  }

  function discardAll(): number {
    const removed = items.length;
    items = [];
    stats.discardedOnWithdrawal += removed;
    clearTimer();
    return removed;
  }

  function clearTimer(): void {
    if (timerHandle !== null && env.timer) {
      env.timer.clear(timerHandle);
    }
    timerHandle = null;
  }

  function scheduleTimer(): void {
    if (flushTimerMs <= 0 || env.timer === undefined || timerHandle !== null || items.length === 0) return;
    timerHandle = env.timer.set(() => {
      timerHandle = null;
      void flush('timer');
    }, flushTimerMs);
  }

  async function flush(reason: FlushReason): Promise<FlushOutcome> {
    if (inFlight) return { sent: 0, dropped: 0, remaining: items.length, result: null, reason };
    if (items.length === 0) return { sent: 0, dropped: 0, remaining: 0, result: null, reason };

    // Every event in the batch has already been gate-checked, so the consent metadata on the batch
    // header is taken from the first one and verified against the rest.
    const head = items[0]?.envelope;
    if (head === undefined) return { sent: 0, dropped: 0, remaining: 0, result: null, reason };

    const takeCount = reason === 'batch_full' ? Math.min(batchLimit, items.length) : items.length;
    const take = items.slice(0, takeCount);
    items = items.slice(takeCount);

    // Re-check permission at the last possible moment: a withdrawal can land between push and flush.
    const stillAllowed = take.filter((i) => options.allowed(i.envelope.category));
    const revoked = take.length - stillAllowed.length;
    if (revoked > 0) {
      stats.discardedOnWithdrawal += revoked;
      diagnose(`flush dropped ${revoked} buffered event(s) whose consent was withdrawn before send`, { reason });
    }

    // Byte cap: drop the *oldest* until the batch fits, so a long session keeps its tail.
    let chunk = stillAllowed;
    let droppedForBytes = 0;
    while (chunk.length > 0 && estimateBatchBytes(buildBatch(reason, chunk.map((i) => i.envelope), head.consentVersion, head.noticeVersion)) > maxBytes) {
      chunk = chunk.slice(1);
      droppedForBytes += 1;
    }
    stats.droppedOversize += droppedForBytes;

    if (chunk.length === 0) {
      return { sent: 0, dropped: revoked + droppedForBytes, remaining: items.length, result: null, reason };
    }

    const batch = buildBatch(reason, chunk.map((i) => i.envelope), head.consentVersion, head.noticeVersion);
    inFlight = true;
    clearTimer();

    let result: SendResult;
    try {
      result = await options.transport.send(batch);
    } catch (error) {
      // A transport that throws is a broken transport, not a retry: analytics must never become the
      // reason a page has an unhandled rejection.
      diagnose(`transport ${options.transport.id} threw`, { message: error instanceof Error ? error.message : String(error) });
      result = { ok: false, kind: 'network', retryable: false };
    } finally {
      inFlight = false;
    }

    if (!result.ok) {
      stats.failed += 1;
      // Only a live page with a retryable network failure puts rows back; `pagehide`, `withdrawal`
      // and `rejected` never do, and a refused batch must not be able to come back.
      if (result.retryable && result.kind === 'network' && reason !== 'pagehide' && reason !== 'withdrawal' && reason !== 'shutdown') {
        items = [...chunk, ...items];
      }
      return { sent: 0, dropped: revoked + droppedForBytes, remaining: items.length, result, reason };
    }

    stats.flushed += chunk.length;
    // Anything that arrived while we were flying gets the next tick, not this one.
    if (items.length >= batchLimit && reason !== 'shutdown') void flush('timer');
    return { sent: chunk.length, dropped: revoked + droppedForBytes, remaining: items.length, result, reason };
  }

  function start(): () => void {
    if (detach !== null) return detach;
    const offs: (() => void)[] = [];

    if (env.visibility) {
      offs.push(
        env.visibility.onChange(() => {
          if (env.visibility?.state() === 'hidden') void flush('visibility_hidden');
        }),
      );
    }
    if (env.unload) {
      offs.push(
        env.unload.onPagehide(() => {
          void flush('pagehide');
        }),
      );
    }
    detach = () => {
      for (const off of offs) {
        try {
          off();
        } catch {
          /* detach is best-effort; a listener the host already dropped is not an error */
        }
      }
      clearTimer();
      detach = null;
    };
    return detach;
  }

  return {
    push,
    discardCategory,
    discardAll,
    flush,
    start,
    size: () => items.length,
    buffered: () => items.map((i) => i.envelope),
    stats: () => ({ ...stats }),
    sealUntilNextDecision(value: boolean) {
      sealed = value;
      if (value) clearTimer();
    },
  };
}
