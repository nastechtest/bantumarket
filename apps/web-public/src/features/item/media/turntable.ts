/**
 * The 12-frame turntable — photographs, not polygons.
 *
 * The buyer drags (or arrows) through twelve stills captured at even angles around the item. It
 * reads as a turntable because the frames *are* the capture programme's frames; nothing here needs
 * a GL context, and nothing here pretends to be the 3D page. The 3D page is a link
 * (`/item/:id/inspect`), and this module must never import it — that boundary is the 170 KB budget.
 *
 * The frame count is the one from `api/item-transport.ts` (TURNTABLE_FRAME_COUNT), which exists
 * because the capture pipeline produces twelve; a turntable that renders eleven frames of a twelve
 * frame strip shows a torn image, so the component asserts the count where it can.
 */

import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { TURNTABLE_FRAME_COUNT } from '../api/item-transport.js';

/** Pixels of horizontal drag that advance one frame when the sweep covers the full circle. */
export const DEFAULT_SWEEP_PX = 280;

/**
 * Frame from a drag delta, wrapping both directions. `Math.floor` before the modulo so a leftward
 * drag of 0.6 frame-width does not advance; the wrap makes the strip feel like a circle without
 * any state outside the frame index.
 */
export function frameFromDelta(deltaPx: number, sweepPx: number, frames: number = TURNTABLE_FRAME_COUNT): number {
  if (!(sweepPx > 0) || frames <= 0) return 0;
  const raw = (deltaPx / sweepPx) * frames;
  const stepped = Math.floor(raw);
  return mod(stepped, frames);
}

export function frameAfterStep(frame: number, step: number, frames: number = TURNTABLE_FRAME_COUNT): number {
  return mod(Math.round(frame) + step, frames);
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Background-position for the active frame of a horizontal strip. Percentage (not pixels): with an
 * image of `frames` equal slices sized to the container, `x/(frames-1) * 100%` lands exactly on
 * frame x at any container width — the one sprite trick that survives responsive layout.
 */
export function stripFrameStyle(
  frame: number,
  stripUrl: string,
  frames: number = TURNTABLE_FRAME_COUNT,
): CSSProperties {
  const f = mod(Math.round(frame), frames);
  const pct = frames === 1 ? 0 : (f / (frames - 1)) * 100;
  return {
    backgroundImage: `url(${JSON.stringify(stripUrl)})`,
    backgroundSize: `${frames * 100}% 100%`,
    backgroundPosition: `${pct}% 0%`,
    backgroundRepeat: 'no-repeat',
  };
}

export interface TurntableState {
  readonly frame: number;
  readonly dragging: boolean;
  readonly handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  };
  readonly setFrame: (frame: number) => void;
}

/**
 * Drag/keyboard state for the turntable surface. Pointer capture is called defensively
 * (`?.`) because jsdom does not implement it and the no-3D CI pass renders this component for
 * real — an unguarded capture call would crash the exact test that proves 3D is optional.
 */
export function useTurntable(initialFrame = 0, sweepPx: number = DEFAULT_SWEEP_PX): TurntableState {
  const [frame, setFrameState] = useState(() => mod(initialFrame, TURNTABLE_FRAME_COUNT));
  const [dragging, setDragging] = useState(false);
  const anchor = useRef<{ startX: number; startFrame: number } | null>(null);

  const setFrame = useCallback((next: number) => {
    setFrameState(mod(Math.round(next), TURNTABLE_FRAME_COUNT));
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    anchor.current = { startX: event.clientX, startFrame: frame };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [frame]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const a = anchor.current;
    if (a === null) return;
    const frameAtPointer = mod(a.startFrame + frameFromDelta(event.clientX - a.startX, sweepPx), TURNTABLE_FRAME_COUNT);
    setFrameState(frameAtPointer);
  }, [sweepPx]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    anchor.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setFrameState((f) => frameAfterStep(f, 1));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setFrameState((f) => frameAfterStep(f, -1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFrameState(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setFrameState(TURNTABLE_FRAME_COUNT - 1);
    }
  }, []);

  return {
    frame,
    dragging,
    setFrame,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onKeyDown },
  };
}
