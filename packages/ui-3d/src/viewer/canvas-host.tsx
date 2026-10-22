import { Canvas, type RootState } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * Canvas host (07 §4.1 `viewer/`, the risk-carrying directory).
 *
 * Three owned behaviours the framework does not give you:
 *  1. DPR cap — see `devicePixelRatioCap`.
 *  2. Context loss — the browser revokes the GL context under GPU pressure and, by default, you
 *     get a black rectangle and no error. Loss is treated as terminal for the session and handed
 *     to the app, which swaps to the static path: a half-restored context shows a buyer a corrupt
 *     render of the item they are about to pay for, and the static path is complete anyway.
 *  3. Disposal — a context that is not disposed leaks GPU memory until the tab dies. On the
 *     reference device that is the difference between a page and a crash.
 */

export interface CanvasHostProps {
  readonly children: ReactNode;
  readonly dprCap: number;
  /** Called when the GL context is lost OR restored. The app swaps to the static path. */
  readonly onContextLost?: (info: { reason: string }) => void;
  readonly onReady?: () => void;
  readonly ariaLabel: string;
  readonly idleHydrate?: boolean;
  readonly frameloop?: 'always' | 'demand' | 'never';
}

/**
 * Idle hydration: the scene mounts after the page is interactive, never before. The poster is
 * already painted, so this costs the buyer nothing and buys the main thread back for checkout.
 */
function useIdleMount(active: boolean): boolean {
  const [mounted, setMounted] = useState(!active);
  useEffect(() => {
    if (mounted) return;
    let cancelled = false;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => !cancelled && setMounted(true), { timeout: 2000 });
    } else {
      const t = window.setTimeout(() => !cancelled && setMounted(true), 200);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [mounted]);
  return mounted;
}

export function CanvasHost({
  children,
  dprCap,
  onContextLost,
  onReady,
  ariaLabel,
  idleHydrate = true,
  frameloop = 'demand',
}: CanvasHostProps) {
  const show = useIdleMount(idleHydrate);
  const dpr = useMemo(() => Math.min(window.devicePixelRatio || 1, dprCap), [dprCap]);
  const rootRef = useRef<RootState | null>(null);

  useEffect(() => {
    if (!show) return;
    const canvas = canvasHostSelector();
    if (!canvas) return;
    const lost = (event: Event) => {
      event.preventDefault();
      onContextLost?.({ reason: 'context-lost' });
    };
    canvas.addEventListener('webglcontextlost', lost, false);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [show, onContextLost]);

  useEffect(() => {
    /** Explicit teardown. R3F disposes its own objects; this covers the context and the loop. */
    return () => {
      const root = rootRef.current;
      if (root) {
        root.gl.setAnimationLoop?.(null);
        root.gl.dispose?.();
      }
    };
  }, []);

  if (!show) return null;

  return (
    <Canvas
      dpr={dpr}
      frameloop={frameloop}
      gl={{ antialias: dpr < 2, powerPreference: 'high-performance', alpha: true, failIfMajorPerformanceCaveat: true }}
      camera={{ position: [0.22, 0.12, 0.42], fov: 32, near: 0.01, far: 5 }}
      onCreated={(state) => {
        rootRef.current = state;
        state.gl.setClearColor(raw.color.paper, 0);
        onReady?.();
      }}
      aria-label={ariaLabel}
      role="group"
      style={{ background: `radial-gradient(120% 120% at 50% 15%, ${tokens.surface.raised} 0%, ${raw.color.paper} 62%)` }}
    >
      {children}
    </Canvas>
  );
}

/** R3F mounts its canvas inside the div it renders; find it without threading a ref through children. */
function canvasHostSelector(): HTMLCanvasElement | null {
  return document.querySelector('canvas');
}
