import { installDom } from './dom/env.js';

/**
 * A controllable `matchMedia`.
 *
 * jsdom does ship `window.matchMedia`, and that is the trap: it never throws, it always reports
 * `matches: false`, and it silently ignores listeners. So a `prefers-reduced-motion` test "passes"
 * against it while proving nothing — the motion path can only ever be taken when the query is true,
 * and with jsdom it never is. `capability.ts` in ui-3d reads exactly this for
 * `prefersReducedMotion`/`coarsePointer`, and the viewer's frame governor reads it for animation, so
 * the fake has to be flippable *and* has to fire listeners, which is what a component re-rendering on
 * a live preference change depends on.
 */

export interface MediaQueryRecord {
  readonly media: string;
  matches: boolean;
  readonly listeners: Set<(event: { matches: boolean; media: string }) => void>;
}

export interface FakeMediaQuery {
  readonly media: string;
  readonly matches: boolean;
  readonly onchange: ((event: { matches: boolean }) => void) | null;
  addEventListener(type: 'change', listener: (event: { matches: boolean; media: string }) => void): void;
  removeEventListener(type: 'change', listener: (event: { matches: boolean; media: string }) => void): void;
  addListener(listener: (event: { matches: boolean; media: string }) => void): void;
  removeListener(listener: (event: { matches: boolean; media: string }) => void): void;
  dispatchEvent(event: { matches: boolean }): boolean;
}

export interface MatchMediaHarness {
  install(): void;
  uninstall(): void;
  /** Declare a query and its initial value before rendering. Unknown queries report false. */
  set(media: string, matches: boolean): void;
  get(media: string): boolean | undefined;
  /** Flip a query and notify listeners, the way an OS-level preference change would. */
  flip(media: string, matches: boolean): void;
  /** Number of live listeners — non-zero after unmount means the component leaked a subscription. */
  listenerCount(media: string): number;
  reset(): void;
}

const PREFERS_REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const PREFERS_COARSE_POINTER = '(pointer: coarse)';

/** The queries the product actually branches on, pre-declared false: a test must opt INTO a variant. */
const DEFAULTS: readonly string[] = [PREFERS_REDUCED_MOTION, PREFERS_COARSE_POINTER, '(display-mode: standalone)'];

export function createMatchMediaHarness(): MatchMediaHarness {
  const records = new Map<string, MediaQueryRecord>();
  let previousDescriptor: PropertyDescriptor | undefined;
  let active = false;

  function recordFor(media: string): MediaQueryRecord {
    const existing = records.get(media);
    if (existing !== undefined) return existing;
    const created: MediaQueryRecord = { media, matches: false, listeners: new Set() };
    records.set(media, created);
    return created;
  }

  function queryOf(rec: MediaQueryRecord): FakeMediaQuery {
    const fake: FakeMediaQuery = {
      media: rec.media,
      get matches() {
        return rec.matches;
      },
      onchange: null,
      addEventListener(type: 'change', listener) {
        if (type !== 'change') return;
        rec.listeners.add(listener);
      },
      removeEventListener(type: 'change', listener) {
        if (type !== 'change') return;
        rec.listeners.delete(listener);
      },
      addListener(listener) {
        rec.listeners.add(listener);
      },
      removeListener(listener) {
        rec.listeners.delete(listener);
      },
      dispatchEvent(event) {
        rec.matches = event.matches;
        for (const listener of rec.listeners) listener({ matches: event.matches, media: rec.media });
        fake.onchange?.({ matches: event.matches });
        return true;
      },
    };
    return fake;
  }

  return {
    install() {
      const dom = installDom();
      if (active) return;
      for (const media of DEFAULTS) recordFor(media);
      previousDescriptor = Object.getOwnPropertyDescriptor(dom.window, 'matchMedia');
      Object.defineProperty(dom.window, 'matchMedia', {
        value: (media: string) => queryOf(recordFor(media)),
        configurable: true,
        writable: true,
      });
      // `globalThis.matchMedia` too: some components call it bare, and a window-only install makes
      // those read jsdom's silent stub while the window-reading tests do not.
      Object.defineProperty(globalThis, 'matchMedia', {
        value: (media: string) => queryOf(recordFor(media)),
        configurable: true,
        writable: true,
      });
      active = true;
    },
    uninstall() {
      if (!active) return;
      const dom = installDom();
      if (previousDescriptor !== undefined) Object.defineProperty(dom.window, 'matchMedia', previousDescriptor);
      else delete (dom.window as unknown as Record<string, unknown>)['matchMedia'];
      delete (globalThis as Record<string, unknown>)['matchMedia'];
      records.clear();
      previousDescriptor = undefined;
      active = false;
    },
    set(media: string, matches: boolean) {
      recordFor(media).matches = matches;
    },
    get(media: string) {
      return records.get(media)?.matches;
    },
    flip(media: string, matches: boolean) {
      queryOf(recordFor(media)).dispatchEvent({ matches });
    },
    listenerCount(media: string) {
      return records.get(media)?.listeners.size ?? 0;
    },
    reset() {
      for (const record of records.values()) {
        record.matches = false;
        record.listeners.clear();
      }
    },
  };
}

export function installMatchMedia(initial?: Record<string, boolean>): MatchMediaHarness {
  const harness = createMatchMediaHarness();
  harness.install();
  if (initial !== undefined) {
    for (const [media, matches] of Object.entries(initial)) harness.set(media, matches);
  }
  return harness;
}

export { PREFERS_REDUCED_MOTION, PREFERS_COARSE_POINTER };
