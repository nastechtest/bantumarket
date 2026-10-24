import { useEffect, useSyncExternalStore } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { LAYER } from '../overlay/layer.js';
import { overlayAnimCss, entranceAnimation } from '../overlay/anim.js';
import { toastStore } from './toast-store.js';
import type { Toast, ToastStore, ToastTone } from './toast-store.js';

const TONE_EDGE: Record<ToastTone, string> = {
  info: raw.color.ink300,
  positive: tokens.assurance.disclosed,
  caution: raw.color.signalCaution,
  negative: raw.color.signalNegative,
};

const DEFAULT_TTL_MS = 6000;

export interface ToastViewportProps {
  store?: ToastStore;
  /** Override for toasts that carry no `ttlMs` of their own. */
  ttlMs?: number;
}

/**
 * The toast renderer. The whole reason the store is headless: this side gets to make the
 * announcement contract concrete — assertive (`role="alert"`) for failures that interrupt,
 * polite (`role="status"`) for everything else — and the timer side: a toast that never leaves
 * becomes wallpaper, but a toast that fades out is a state change erased without a trace, so
 * dismissal is instant and its exit is never animated. Reduced motion removes the entrance
 * flourish only; the toast mounts either way, at the same instant the event happened.
 */
export function ToastViewport({ store = toastStore, ttlMs = DEFAULT_TTL_MS }: ToastViewportProps) {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => store.dismiss(toast.id), toast.ttlMs ?? ttlMs),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [store, ttlMs, toasts]);

  if (toasts.length === 0) return null;

  return (
    <>
      <style data-ds-overlay-anim dangerouslySetInnerHTML={{ __html: overlayAnimCss }} />
      <section
        className="ds-toast-region"
        aria-label="Notifications"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: LAYER.toast,
          display: 'flex',
          flexDirection: 'column',
          gap: raw.space.s2,
          padding: raw.space.s4,
          fontFamily: raw.type.familyText,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => store.dismiss(toast.id)} />
        ))}
      </section>
    </>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      role={toast.assertive ? 'alert' : 'status'}
      data-tone={toast.tone}
      className="ds-toast"
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        gap: raw.space.s3,
        alignItems: 'flex-start',
        background: tokens.surface.primary,
        color: tokens.text.primary,
        border: `1px solid ${raw.color.ink100}`,
        borderLeft: `${raw.space.s1} solid ${TONE_EDGE[toast.tone]}`,
        borderRadius: raw.radius.md,
        padding: raw.space.s3,
        maxWidth: '32rem',
        animation: entranceAnimation('ds-panel-rise-in'),
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1, flex: 1 }}>
        <strong style={{ fontSize: '0.875rem' }}>{toast.title}</strong>
        {toast.body ? <span style={{ fontSize: '0.8125rem', color: tokens.text.secondary }}>{toast.body}</span> : null}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss notification: ${toast.title}`}
        style={{
          background: 'none',
          border: `1px solid ${raw.color.ink100}`,
          borderRadius: raw.radius.sm,
          color: tokens.text.primary,
          padding: `${raw.space.s1} ${raw.space.s2}`,
          fontSize: '0.8125rem',
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
}
