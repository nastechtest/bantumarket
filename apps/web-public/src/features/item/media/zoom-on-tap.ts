/**
 * Zoom-on-tap. Pure math first, DOM second: a phone buyer taps where they want to look (a bezel
 * hairline, an engraving) and the frame magnifies around that point. The origin conversion is the
 * whole trick and the whole risk — computed wrong, the zoom centres somewhere the buyer did not
 * point at, and the first thing they were trying to inspect slips off-screen.
 */

import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';


export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const ZOOM_LEVEL = 2.2;
const EDGE_CLAMP = 10;

/**
 * Tap point → CSS `transform-origin` percentages. Clamped away from the edges because at 2.2×
 * content near a 0% origin is dragged outside the box and the mark being inspected disappears —
 * which is worse than no zoom.
 */
export function zoomOriginFromTap(x: number, y: number, rect: RectLike): { readonly originX: number; readonly originY: number } {
  if (rect.width <= 0 || rect.height <= 0) return { originX: 50, originY: 50 };
  const rawX = ((x - rect.left) / rect.width) * 100;
  const rawY = ((y - rect.top) / rect.height) * 100;
  return { originX: clamp(rawX, EDGE_CLAMP, 100 - EDGE_CLAMP), originY: clamp(rawY, EDGE_CLAMP, 100 - EDGE_CLAMP) };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Structural: anything that knows where the tap landed (pointer or mouse) and what was tapped is
 * enough. `currentTarget` is not decoration — the rect the origin is computed from has to be the
 * box the buyer actually pointed inside, so a rect taken from anywhere else centres the zoom on the
 * wrong pixels and hides the mark they came to look at.
 */
export interface TapLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly currentTarget: { getBoundingClientRect(): RectLike };
}

export interface ZoomState {
  readonly zoomed: boolean;
  readonly originX: number;
  readonly originY: number;
  readonly toggle: (event: TapLike) => void;
  readonly reset: () => void;
}

export function useZoomOnTap(): ZoomState {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ originX: 50, originY: 50 });

  const toggle = useCallback((event: TapLike) => {
    const next = zoomOriginFromTap(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    setOrigin(next);
    setZoomed((z) => !z);
  }, []);

  const reset = useCallback(() => setZoomed(false), []);

  return { zoomed, originX: origin.originX, originY: origin.originY, toggle, reset };
}

/** Inline transform for a zoomed surface; `null` when flat so callers can spread it away. */
export function zoomTransformStyle(zoomed: boolean, originX: number, originY: number): CSSProperties | null {
  if (!zoomed) return null;
  return {
    transform: `scale(${ZOOM_LEVEL})`,
    transformOrigin: `${originX}% ${originY}%`,
    transition: 'transform 160ms ease-out',
  };
}
