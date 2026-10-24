import { installDom } from './dom/env.js';

/**
 * A driveable `IntersectionObserver` — the visibility gate's only external input.
 *
 * `ui-3d`'s visibility gate defers scene work until the host scrolls into view, and the item grid
 * lazily loads posters the same way. jsdom never fires an intersection callback, so without a
 * driveable fake those components look broken ("nothing ever rendered") or, worse, tests assert the
 * lazy path by asserting the eager one.
 *
 * The fake fires once on `observe` with `isIntersecting: false`, matching a below-the-fold element on
 * a real page, and `enter()`/`leave()` then move it. A test that never calls `enter()` is testing the
 * deferred branch, which is a legitimate thing to assert — but it must be a choice, not an accident.
 */

export interface IntersectionEntryLike {
  readonly target: Element;
  readonly isIntersecting: boolean;
  readonly intersectionRatio: number;
  readonly boundingClientRect: DOMRect;
  readonly time: number;
}

type Callback = (entries: readonly IntersectionEntryLike[], observer: FakeIntersectionObserver) => void;

export interface FakeIntersectionObserver {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
  readonly observed: readonly Element[];
  /** Mark the target as on-screen and fire the callback the way the browser would. */
  enter(target: Element, ratio?: number): boolean;
  /** Mark it off-screen again. */
  leave(target: Element): boolean;
  /** Options the component passed in — assert `threshold`/`rootMargin` survived to the observer. */
  readonly options: { root: Element | Document | null; rootMargin: string; thresholds: readonly number[] };
}

export interface IntersectionObserverHarness {
  install(): void;
  uninstall(): void;
  readonly instances: readonly FakeIntersectionObserver[];
  /** Enter every observed target of every instance; returns how many fired. */
  enterAll(ratio?: number): number;
}

export function createIntersectionObserverHarness(): IntersectionObserverHarness {
  const instances: FakeIntersectionObserver[] = [];
  let previousDescriptor: PropertyDescriptor | undefined;
  let active = false;

  class Observer implements FakeIntersectionObserver {
    private readonly targets = new Set<Element>();
    private readonly state = new Map<Element, boolean>();
    private disconnected = false;

    constructor(
      private readonly callback: Callback,
      readonly options: { root: Element | Document | null; rootMargin: string; thresholds: readonly number[] },
    ) {
      instances.push(this);
    }

    observe(target: Element): void {
      this.targets.add(target);
      this.state.set(target, false);
      const initial = this.entryFor(target, false, 0);
      queueMicrotask(() => {
        if (this.disconnected) return;
        this.callback([initial], this);
      });
    }

    unobserve(target: Element): void {
      this.targets.delete(target);
      this.state.delete(target);
    }

    disconnect(): void {
      this.targets.clear();
      this.state.clear();
      this.disconnected = true;
    }

    get observed(): readonly Element[] {
      return [...this.targets];
    }

    private entryFor(target: Element, isIntersecting: boolean, ratio: number): IntersectionEntryLike {
      return {
        target,
        isIntersecting,
        intersectionRatio: ratio,
        boundingClientRect: target.getBoundingClientRect(),
        time: Date.now(),
      };
    }

    private transition(target: Element, isIntersecting: boolean, ratio: number): boolean {
      if (!this.targets.has(target) || this.disconnected) return false;
      if (this.state.get(target) === isIntersecting) return false;
      this.state.set(target, isIntersecting);
      this.callback([this.entryFor(target, isIntersecting, ratio)], this);
      return true;
    }

    enter(target: Element, ratio = 1): boolean {
      return this.transition(target, true, ratio);
    }

    leave(target: Element): boolean {
      return this.transition(target, false, 0);
    }
  }

  return {
    install() {
      const g = globalThis as unknown as Record<string, unknown>;
      installDom();
      if (active) return;
      previousDescriptor = Object.getOwnPropertyDescriptor(g, 'IntersectionObserver');
      const ctor = function (callback: Callback, init?: IntersectionObserverInit) {
        return new Observer(callback, {
          root: init?.root ?? null,
          rootMargin: init?.rootMargin ?? '0px',
          thresholds:
            typeof init?.threshold === 'number'
              ? [init.threshold]
              : Array.isArray(init?.threshold)
                ? [...init.threshold]
                : [0],
        });
      };
      Object.defineProperty(g, 'IntersectionObserver', { value: ctor, configurable: true, writable: true });
      active = true;
    },
    uninstall() {
      const g = globalThis as unknown as Record<string, unknown>;
      if (!active) return;
      if (previousDescriptor !== undefined) Object.defineProperty(g, 'IntersectionObserver', previousDescriptor);
      else delete g['IntersectionObserver'];
      instances.length = 0;
      previousDescriptor = undefined;
      active = false;
    },
    get instances(): readonly FakeIntersectionObserver[] {
      return instances;
    },
    enterAll(ratio = 1): number {
      let fired = 0;
      for (const instance of instances) {
        for (const target of instance.observed) {
          if (instance.enter(target, ratio)) fired++;
        }
      }
      return fired;
    },
  };
}

export function installIntersectionObserver(): IntersectionObserverHarness {
  const harness = createIntersectionObserverHarness();
  harness.install();
  return harness;
}
