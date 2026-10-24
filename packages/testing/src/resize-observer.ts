import { installDom } from './dom/env.js';

/**
 * A driveable `ResizeObserver`.
 *
 * jsdom ships none, and the viewer's canvas-size pool plus the sheet components both observe. A stub
 * that only exists (an empty class) is worse than none: the component under test then never learns it
 * is in a small viewport, and "responsive" passes because the callback never fired. This one keeps a
 * registry so a test can *cause* a resize and assert what the component did about it.
 */

export interface ResizeEntryLike {
  readonly target: Element;
  readonly contentRect: { width: number; height: number };
}

type Callback = (entries: readonly ResizeEntryLike[]) => void;

export interface FakeResizeObserver {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
  readonly observed: readonly Element[];
  /** Fire the callback with a size for one observed element. Returns false when it is not observed. */
  resize(target: Element, width: number, height: number): boolean;
}

export interface ResizeObserverHarness {
  install(): void;
  uninstall(): void;
  /** Every instance created since `install()`, in creation order. */
  readonly instances: readonly FakeResizeObserver[];
  /** Resize the first observed element of every instance; a convenience one-liner for suites. */
  resizeAll(width: number, height: number): number;
}

export function createResizeObserverHarness(): ResizeObserverHarness {
  const instances: FakeResizeObserver[] = [];
  let previousDescriptor: PropertyDescriptor | undefined;
  let active = false;

  class Observer implements FakeResizeObserver {
    private readonly targets = new Set<Element>();
    private disconnected = false;

    constructor(private readonly callback: Callback) {
      instances.push(this);
    }

    observe(target: Element): void {
      this.targets.add(target);
      // A real ResizeObserver fires once on observe with the initial size, and components rely on
      // that first call to set their initial layout — omitting it makes the fake quietly different
      // from the browser and hides exactly the "never measured, never sized" bug.
      const rect = target.getBoundingClientRect();
      queueMicrotask(() => {
        if (this.disconnected) return;
        this.callback([{ target, contentRect: { width: rect.width, height: rect.height } }]);
      });
    }

    unobserve(target: Element): void {
      this.targets.delete(target);
    }

    disconnect(): void {
      this.targets.clear();
      this.disconnected = true;
    }

    get observed(): readonly Element[] {
      return [...this.targets];
    }

    resize(target: Element, width: number, height: number): boolean {
      if (!this.targets.has(target) || this.disconnected) return false;
      this.callback([{ target, contentRect: { width, height } }]);
      return true;
    }
  }

  return {
    install() {
      const g = globalThis as unknown as Record<string, unknown>;
      installDom();
      if (!active) {
        previousDescriptor = Object.getOwnPropertyDescriptor(g, 'ResizeObserver');
        Object.defineProperty(g, 'ResizeObserver', { value: Observer, configurable: true, writable: true });
        active = true;
      }
    },
    uninstall() {
      const g = globalThis as unknown as Record<string, unknown>;
      if (!active) return;
      if (previousDescriptor !== undefined) Object.defineProperty(g, 'ResizeObserver', previousDescriptor);
      else delete g['ResizeObserver'];
      instances.length = 0;
      previousDescriptor = undefined;
      active = false;
    },
    get instances(): readonly FakeResizeObserver[] {
      return instances;
    },
    resizeAll(width: number, height: number): number {
      let fired = 0;
      for (const instance of instances) {
        const first = instance.observed[0];
        if (first !== undefined && instance.resize(first, width, height)) fired++;
      }
      return fired;
    },
  };
}

/**
 * Install once per test file. `uninstall()` belongs in `afterEach` so a leaked observer in one suite
 * cannot make the next suite's `instances` list non-empty.
 */
export function installResizeObserver(): ResizeObserverHarness {
  const harness = createResizeObserverHarness();
  harness.install();
  return harness;
}
