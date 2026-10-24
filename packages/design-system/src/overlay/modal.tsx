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

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `alertdialog` for confirmations that interrupt; plain `dialog` otherwise. Both trap the
   * same way — the role changes what a reader announces, not the keyboard contract.
   */
  role?: 'dialog' | 'alertdialog';
}

/**
 * The central overlay: veil + panel + everything the sheet proved, factored onto the shared
 * primitives (`activateFocusTrap`, `lockBodyScroll`, `LAYER`). `onClose` is read through a ref
 * so a parent re-render with a fresh closure does not re-fire the trap — re-activation would
 * yank focus back to the panel while the user is mid-tab.
 */
export function Modal({ open, onClose, title, children, footer, role = 'dialog' }: ModalProps) {
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
        className="ds-modal-root"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: LAYER.overlay,
          fontFamily: raw.type.familyText,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: raw.space.s4,
        }}
      >
        <div
          aria-hidden="true"
          data-scrim=""
          onClick={() => onCloseRef.current()}
          style={{ position: 'absolute', inset: 0, background: SCRIM_INK, animation: entranceAnimation('ds-overlay-fade-in') }}
        />
        <div
          ref={panelRef}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="ds-modal-panel"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '36rem',
            maxHeight: '85vh',
            overflowY: 'auto',
            background: tokens.surface.primary,
            borderRadius: raw.radius.lg,
            padding: raw.space.s5,
            color: tokens.text.primary,
            border: `1px solid ${raw.color.ink100}`,
            animation: entranceAnimation('ds-panel-rise-in'),
          }}
        >
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.0625rem', fontFamily: raw.type.familyDisplay }}>
            {title}
          </h2>
          <div style={{ marginTop: raw.space.s3 }}>{children}</div>
          {footer ? <div style={{ marginTop: raw.space.s5 }}>{footer}</div> : null}
        </div>
      </div>
    </>,
    host,
  );
}
