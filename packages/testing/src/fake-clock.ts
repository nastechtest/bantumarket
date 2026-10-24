/**
 * A deterministic clock: `setTimeout`, `setInterval`, `Date.now` and `performance.now` under control.
 *
 * Why not `bun`'s own fake timers: the product code under test schedules through three different
 * primitives (React's scheduler via `performance.now`, `setTimeout` for retry backoff, `Date.now` for
 * timestamps in order fixtures) and a fake that replaces only one of them produces tests that pass by
 * accident — a `runAll()` that never flushes `performance.now` still "completes". This installs all
 * four together and refuses to run twice without a restore.
 *
 * Microtasks and awaited promises are NOT virtual: `advance()` drains them with a bounded real flush,
 * so `await api.getOrder()` inside a test still resolves. A clock that swallows the microtask queue
 * cannot test a loading state, which is the main thing a clock is for here.
 */

export interface FakeClock {
  /** Current virtual time in ms. */
  now(): number;
  /** Move virtual time forward by `ms`, running every timer that becomes due, in due order. */
  advance(ms: number): Promise<void>;
  /** Synchronous variant for tests that cannot await (React `act()` bodies). */
  advanceSync(ms: number): void;
  /** Run until no timer is pending; throws if one re-arms itself forever. */
  runAll(): Promise<void>;
  /** Set virtual time to an absolute ms value without firing anything. */
  setNow(ms: number): void;
  /** Pending timer count — assert it to prove a scheduled effect really was cancelled. */
  pending(): number;
  restore(): void;
}

interface TimerRecord {
  id: number;
  at: number;
  intervalMs: number | null;
  callback: () => void;
  cancelled: boolean;
}

/** Longest real flush we are willing to await for pending promise chains. */
const MAX_FLUSH_TURNS = 50;

export function installFakeClock(startMs = 0): FakeClock {
  const g = globalThis as unknown as Record<string, unknown>;
  const previous = {
    setTimeout: g['setTimeout'],
    clearTimeout: g['clearTimeout'],
    setInterval: g['setInterval'],
    clearInterval: g['clearInterval'],
    dateNow: Date.now,
    performanceNow: g['performance'] === undefined ? null : (g['performance'] as Performance).now,
  };

  let virtual = startMs;
  let nextId = 1;
  const timers = new Map<number, TimerRecord>();
  const realSetTimeout = previous.setTimeout as <T>(fn: () => T, ms: number) => T extends never ? never : ReturnType<typeof setTimeout>;

  function schedule(callback: () => void, ms: number, intervalMs: number | null): number {
    const id = nextId++;
    const delay = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
    timers.set(id, { id, at: virtual + delay, intervalMs, callback, cancelled: false });
    return id;
  }

  /**
   * Runs due timers in due order. Equal due-times keep insertion order, which is what a real queue
   * does and what "fetch then retry" tests depend on.
   */
  function drain(limit: number): number {
    let fired = 0;
    for (;;) {
      let due: TimerRecord | null = null;
      for (const record of timers.values()) {
        if (record.cancelled || record.at > virtual) continue;
        if (due === null || record.at < due.at || (record.at === due.at && record.id < due.id)) due = record;
      }
      if (due === null) return fired;
      fired++;
      if (due.intervalMs === null) timers.delete(due.id);
      else due.at = virtual + due.intervalMs;
      try {
        due.callback();
      } catch (error) {
        // A throwing timer must not strand the queue: a real event loop reports it and moves on,
        // and a fake that stops here hides every later assertion behind one bad callback.
        if (fired < MAX_FLUSH_TURNS) console.error('[fake-clock] timer callback threw', error);
      }
      if (fired > limit) {
        throw new Error(`[fake-clock] more than ${limit} timers fired in one drain — likely a self-rearming interval`);
      }
    }
  }

  function clear(id: number): void {
    const record = timers.get(id);
    if (record === undefined) return;
    record.cancelled = true;
    timers.delete(id);
  }

  g['setTimeout'] = (fn: () => void, ms = 0) => schedule(fn, ms, null);
  g['setInterval'] = (fn: () => void, ms = 0) => schedule(fn, ms, Math.max(1, Math.floor(ms)));
  g['clearTimeout'] = (id: number) => clear(id);
  g['clearInterval'] = (id: number) => clear(id);
  Date.now = () => virtual;
  const performance = g['performance'] as Performance | undefined;
  if (performance !== undefined) {
    Object.defineProperty(performance, 'now', { value: () => virtual, configurable: true, writable: true });
  }

  const clock: FakeClock = {
    now: () => virtual,
    setNow: (ms: number) => {
      virtual = ms;
    },
    pending: () => timers.size,
    advanceSync: (ms: number) => {
      if (ms < 0) throw new RangeError('[fake-clock] advance() takes a non-negative duration');
      virtual += ms;
      drain(MAX_FLUSH_TURNS * 10);
    },
    advance: async (ms: number) => {
      if (ms < 0) throw new RangeError('[fake-clock] advance() takes a non-negative duration');
      virtual += ms;
      drain(MAX_FLUSH_TURNS * 10);
      // Let promise chains created by the fired timers settle on the real microtask queue.
      for (let turn = 0; turn < MAX_FLUSH_TURNS; turn++) {
        await Promise.resolve();
      }
      // A second drain catches timers scheduled by those promise chains, which is the normal shape
      // of "request resolves then the client schedules a retry backoff".
      drain(MAX_FLUSH_TURNS * 10);
      for (let turn = 0; turn < MAX_FLUSH_TURNS; turn++) {
        await Promise.resolve();
      }
    },
    runAll: async () => {
      let guard = 0;
      while (timers.size > 0) {
        const soonest = Math.min(...[...timers.values()].filter((t) => !t.cancelled).map((t) => t.at));
        virtual = Number.isFinite(soonest) ? soonest : virtual + 1;
        drain(MAX_FLUSH_TURNS * 10);
        for (let turn = 0; turn < MAX_FLUSH_TURNS; turn++) await Promise.resolve();
        if (++guard > 1000) throw new Error('[fake-clock] runAll() did not converge — an interval re-arms forever');
      }
    },
    restore: () => {
      g['setTimeout'] = previous.setTimeout;
      g['clearTimeout'] = previous.clearTimeout;
      g['setInterval'] = previous.setInterval;
      g['clearInterval'] = previous.clearInterval;
      Date.now = previous.dateNow;
      if (performance !== undefined && previous.performanceNow !== null) {
        Object.defineProperty(performance, 'now', {
          value: previous.performanceNow.bind(performance),
          configurable: true,
          writable: true,
        });
      }
      timers.clear();
    },
  };

  return clock;
}

/**
 * `advance()` without the awaits: for tests that only need `Date.now` to move (timestamp formatting)
 * and would break if a real timer were deferred.
 */
export function withFixedDate<T>(ms: number, run: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  const original = g['Date'] as typeof Date;
  class FixedDate extends original {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(ms);
      else super(...(args as [number]));
    }
    static override now(): number {
      return ms;
    }
  }
  g['Date'] = FixedDate as unknown as DateConstructor;
  try {
    return run();
  } finally {
    g['Date'] = original;
  }
}
