import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Visibility gate (07 §4.1 `viewer/`).
 *
 * On a listing grid, six scenes invalidating while five are off-screen is the difference between
 * 60 fps and a stutter. The gate observes the wrapper, and the host maps `visible` to the canvas
 * frameloop: off-screen means 'never' — the loop is stopped, not slowed. This module imports no
 * scene runtime on purpose: the gating logic is testable with a fake observer and no GL context.
 */

export type GateEntry = { readonly isIntersecting: boolean; readonly intersectionRatio: number };
export type GateCallback = (entry: GateEntry, target: Element) => void;

export interface GateObserver {
  observe(element: Element): void;
  disconnect(): void;
}
export type GateObserverFactory = (callback: GateCallback, options: { threshold: number; rootMargin: string }) => GateObserver | null;

/** The one mapping the host needs: visible canvases may be asked to render, invisible ones may not. */
export function frameloopForVisibility(visible: boolean): 'demand' | 'never' {
  return visible ? 'demand' : 'never';
}

const defaultObserverFactory: GateObserverFactory = (callback, options) => {
  const scope = globalThis as {
    IntersectionObserver?: new (
      cb: (entries: readonly { isIntersecting: boolean; intersectionRatio: number; target: Element }[]) => void,
      init?: { threshold?: number; rootMargin?: string },
    ) => { observe(el: Element): void; disconnect(): void };
  };
  if (typeof scope.IntersectionObserver !== 'function') return null;
  return new scope.IntersectionObserver(
    (entries) => {
      const first = entries[0];
      if (first) callback({ isIntersecting: first.isIntersecting, intersectionRatio: first.intersectionRatio }, first.target);
    },
    { threshold: options.threshold, rootMargin: options.rootMargin },
  );
};

export interface VisibilityGateProps {
  /** Render-prop: the host receives the current visibility and wires it to the frameloop. */
  readonly children: (visible: boolean) => ReactNode;
  readonly onChange?: (visible: boolean) => void;
  readonly threshold?: number;
  readonly rootMargin?: string;
  readonly observerFactory?: GateObserverFactory;
}

export function VisibilityGate({
  children,
  onChange,
  threshold = 0.01,
  rootMargin = '120px',
  observerFactory,
}: VisibilityGateProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Assume visible until proven otherwise: a device with no IntersectionObserver still deserves
  // its scene, and refusing it because the API is missing would invert rule 1's spirit.
  const [visible, setVisible] = useState(true);
  const lastReported = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const factory = observerFactory ?? defaultObserverFactory;
    // onChange fires from here, not from inside the setState updater: the updater must stay pure
    // and StrictMode invokes it twice.
    const observer = factory((entry) => {
      setVisible(entry.isIntersecting);
      if (lastReported.current !== entry.isIntersecting) {
        lastReported.current = entry.isIntersecting;
        onChange?.(entry.isIntersecting);
      }
    }, { threshold, rootMargin });
    if (!observer) return;
    observer.observe(element);
    return () => observer.disconnect();
  }, [observerFactory, threshold, rootMargin, onChange]);

  return <div ref={ref} data-scene-visible={visible ? 'true' : 'false'}>{children(visible)}</div>;
}
