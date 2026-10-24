import { useCallback, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { durations, motionOk } from '@nastech/motion';

export interface TooltipTriggerProps {
  'aria-describedby': string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
}

export interface TooltipContentProps {
  id: string;
  role: 'tooltip';
}

export interface UseTooltipResult {
  open: boolean;
  show: () => void;
  hide: () => void;
  triggerProps: TooltipTriggerProps;
  contentProps: TooltipContentProps;
}

/**
 * Headless tooltip behaviour; the consumer renders the trigger and the text node. Rules that
 * tests hold:
 *  - Text is attached with `aria-describedby`, never as a focus target — a tooltip must not
 *    interrupt the tab sequence, so nothing here moves focus.
 *  - Pointer hover waits one `standard` duration (the flick-across-the-screen case); keyboard
 *    focus shows instantly, because a keyboard user asked for the target deliberately. Under
 *    reduced motion the hover delay is dropped too — motion flourish is what yields, never the
 *    information itself.
 *  - Escape hides it. Hovering away or blurring hides it. There is no timer race: every hide
 *    clears the pending show.
 */
export function useTooltip(): UseTooltipResult {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clear();
    setOpen(false);
  }, [clear]);

  const show = useCallback(() => {
    clear();
    setOpen(true);
  }, [clear]);

  const showDelayed = useCallback(() => {
    clear();
    const delay = motionOk('transition') ? durations.standard : 0;
    if (delay === 0) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  }, [clear]);

  return {
    open,
    show,
    hide,
    triggerProps: {
      'aria-describedby': id,
      onMouseEnter: showDelayed,
      onMouseLeave: hide,
      onFocus: show,
      onBlur: hide,
      onKeyDown: (event: ReactKeyboardEvent) => {
        if (event.key === 'Escape') hide();
      },
    },
    contentProps: { id, role: 'tooltip' },
  };
}
