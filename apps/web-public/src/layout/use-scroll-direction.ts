import { useEffect, useState } from 'react';

/**
 * Scroll direction, for the one legitimate use in a marketplace header: get out of the way on
 * the way down, come back instantly on the way up. A sticky header that eats 56px during a
 * browse session is a sticky header people scroll past items to avoid.
 *
 * The decision logic is a pure function because the interesting bugs (jitter at the threshold,
 * rubber-band overscroll on iOS) are logic bugs, and logic bugs want unit tests, not a browser.
 */

export type ScrollDirection = 'up' | 'down' | 'idle';

export const SCROLL_HYSTERESIS_PX = 12;

export function nextDirection(
  prev: ScrollDirection,
  previousY: number,
  currentY: number,
  hysteresis = SCROLL_HYSTERESIS_PX,
): { direction: ScrollDirection; anchor: number } {
  const delta = currentY - previousY;
  if (Math.abs(delta) < hysteresis) return { direction: prev, anchor: previousY };
  // Top of the page is always revealed: a header hidden into the browser chrome is a bug report.
  if (currentY <= 0) return { direction: 'up', anchor: 0 };
  return { direction: delta > 0 ? 'down' : 'up', anchor: currentY };
}

export function useScrollDirection(): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setDirection((prev) => {
          const next = nextDirection(prev, last, window.scrollY);
          last = next.anchor;
          return next.direction;
        });
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return direction;
}
