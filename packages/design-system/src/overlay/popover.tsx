import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { LAYER } from './layer.js';

export interface PopoverProps {
  triggerLabel: string;
  /** Labels the floating region for readers; the trigger alone does not say what opened. */
  ariaLabel: string;
  children: ReactNode;
  placement?: 'bottom' | 'top';
}

/**
 * A non-modal floating panel anchored to its own trigger. It deliberately does not trap focus:
 * a popover is a continuation of the trigger, so Tab walking out of it is correct behaviour.
 * What it must not do is leave the trigger in a lying state — `aria-expanded` and
 * `aria-controls` flip with the content, and Escape returns focus to the trigger it opened from.
 */
export function Popover({ triggerLabel, ariaLabel, children, placement = 'bottom' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const wrap = wrapRef.current;
      if (wrap && !wrap.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const closeAndReturn = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndReturn();
    }
  };

  return (
    <span
      ref={wrapRef}
      className="ds-popover-wrap"
      style={{ position: 'relative', display: 'inline-block', fontFamily: raw.type.familyText }}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: tokens.surface.primary,
          color: tokens.text.primary,
          border: `1px solid ${raw.color.ink300}`,
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s3}`,
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}
      >
        {triggerLabel}
      </button>
      {open ? (
        <span
          id={contentId}
          role="group"
          aria-label={ariaLabel}
          data-ds-popover=""
          style={{
            position: 'absolute',
            [placement === 'bottom' ? 'top' : 'bottom']: '100%',
            left: 0,
            marginTop: placement === 'bottom' ? raw.space.s2 : undefined,
            marginBottom: placement === 'top' ? raw.space.s2 : undefined,
            zIndex: LAYER.menu,
            minWidth: 'max-content',
            background: tokens.surface.primary,
            color: tokens.text.primary,
            border: `1px solid ${raw.color.ink100}`,
            borderRadius: raw.radius.md,
            padding: raw.space.s3,
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
