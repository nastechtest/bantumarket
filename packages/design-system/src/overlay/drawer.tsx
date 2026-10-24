import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { raw, tokens } from '@nastech/design-tokens';
import { LAYER } from './layer.js';
import { SCRIM_INK } from './veil.js';
import { overlayAnimCss, entranceAnimation } from './anim.js';
import { useOverlayContainer } from './portal.js';
import { activateFocusTrap } from './focus-trap.js';
import { lockBodyScroll } from './scroll-lock.js';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** `end` (right) is the staff-queue detail surface; `start` serves navigation-style drawers. */
  placement?: 'start' | 'end';
}

/**
 * Side-anchored overlay panel. The keyboard contract is the modal's, unmodified — one trap,
 * one inert background, one focus return — because a drawer that behaves differently from a
 * modal is how keyboard users learn to distrust overlays.
 */
export function Drawer({ open, onClose, title, children, placement = 'end' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const host = useOverlayContainer();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const unlock = lockBodyScroll();
    const trap = activateFocusTrap(panel, { onEscape: () => onCloseRef.current() });
    return () => {
      trap.deactivate();
      unlock();
    };
  }, [open, host]);

  if (!open || !host) return null;

  return createPortal(
    <>
      <style data-ds-overlay-anim dangerouslySetInnerHTML={{ __html: overlayAnimCss }} />
      <div
        className="ds-drawer-root"
        style={{ position: 'fixed', inset: 0, zIndex: LAYER.overlay, fontFamily: raw.type.familyText }}
      >
        <div
          aria-hidden="true"
          data-scrim=""
          onClick={() => onCloseRef.current()}
          style={{ position: 'absolute', inset: 0, background: SCRIM_INK, animation: entranceAnimation('ds-overlay-fade-in') }}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="ds-drawer-panel"
          data-placement={placement}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: placement === 'start' ? 0 : undefined,
            right: placement === 'end' ? 0 : undefined,
            width: '86%',
            maxWidth: '32rem',
            overflowY: 'auto',
            background: tokens.surface.primary,
            color: tokens.text.primary,
            border: `1px solid ${raw.color.ink100}`,
            padding: raw.space.s4,
            animation: entranceAnimation('ds-panel-side-in'),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: raw.space.s3 }}>
            <h2 id={titleId} style={{ margin: 0, fontSize: '1.0625rem', fontFamily: raw.type.familyDisplay }}>
              {title}
            </h2>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Close"
              style={{
                background: 'none',
                border: `1px solid ${raw.color.ink100}`,
                borderRadius: raw.radius.sm,
                color: tokens.text.primary,
                padding: `${raw.space.s1} ${raw.space.s2}`,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: raw.space.s3 }}>{children}</div>
        </div>
      </div>
    </>,
    host,
  );
}
