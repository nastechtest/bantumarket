import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { raw, tokens } from '@nastech/design-tokens';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Dim from the ink primitive rather than a re-typed rgba — tokens stay the only source of colour. */
function dim(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Bottom sheet for filters and dispute evidence, on the no-WebGL budget: pure DOM.
 *
 * Three behaviours that are easy to get wrong and are the point of this component:
 *  1. Focus trap — Tab/Shift+Tab cycle inside the sheet, Esc closes, and the opener's focus is
 *     restored on close, because a sheet that eats the tab ring is a dead end for keyboards.
 *  2. `inert` behind — every body child except the sheet gets inert + aria-hidden so background
 *     content cannot be read or reached while the sheet owns the screen.
 *  3. Scroll lock without the iOS jump — body is position:fixed at −scrollY (iOS re-renders
 *     document flow at 0 otherwise) and the saved offset is scrolled back to on close.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const wrapper = panel?.parentElement ?? null;
    if (!panel || !wrapper) return;

    const bodyChildCount = document.body.childElementCount;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const savedScrollY = window.scrollY;
    const body = document.body;
    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollY}px`;
    body.style.left = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    const inerted: HTMLElement[] = [];
    for (const node of Array.from(body.children)) {
      if (node === wrapper || node.contains(panel)) continue;
      if (node instanceof HTMLElement) {
        node.setAttribute('inert', '');
        node.setAttribute('aria-hidden', 'true');
        inerted.push(node);
      }
    }

    panel.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.left = previousBodyStyle.left;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      for (const node of inerted) {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      }
      // Only our own wrapper may have been appended; anything else means a third party changed
      // the body, and deleting by position would take their node instead.
      if (document.body.childElementCount === bodyChildCount + 1 && wrapper.parentElement === body) {
        body.removeChild(wrapper);
      }
      window.scrollTo(0, savedScrollY);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="ds-sheet-root"
      style={{ position: 'fixed', inset: 0, zIndex: 40, fontFamily: raw.type.familyText }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: dim(raw.color.ink900, 0.55) }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '85vh',
          overflowY: 'auto',
          background: tokens.surface.primary,
          borderRadius: `${raw.radius.lg} ${raw.radius.lg} 0 0`,
          padding: raw.space.s4,
          color: tokens.text.primary,
        }}
      >
        <h2 id={titleId} style={{ margin: 0, fontSize: '1.0625rem', fontFamily: raw.type.familyDisplay }}>
          {title}
        </h2>
        <div style={{ marginTop: raw.space.s3 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
