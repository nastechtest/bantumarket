import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import {
  animationCss,
  motionOk,
  prefersReducedMotion,
  subscribeReducedMotion,
} from '@nastech/motion';
import type { ToastTone } from '../feedback/toast-store.js';
import { classes } from './styles.js';

export type { ToastTone } from '../feedback/toast-store.js';

/**
 * Animated toast.
 *
 * Two guarantees:
 *  - `role="status"` is present from first paint, so the message is announced whether or not
 *    the entrance animation runs. Reduced motion drops the class, never the toast.
 *  - No auto-dismiss timer exists under reduced motion. An unattended timer would make the
 *    message vanish with no fade, i.e. erase a state change without a trace; reduced-motion
 *    users dismiss explicitly instead. Everyone else keeps the standard 6s TTL.
 *
 * The timer is only for the *uncontrolled* convenience path; the component always renders a
 * labelled dismiss button, so nobody depends on the clock.
 */
export const motionToastCss = animationCss('toast-in');

const DEFAULT_AUTO_DISMISS_MS = 6000;

const TONE_EDGE: Readonly<Record<ToastTone, string>> = {
  info: raw.color.ink300,
  positive: tokens.assurance.disclosed,
  caution: raw.color.signalCaution,
  negative: raw.color.signalNegative,
};

export interface ToastProps {
  readonly title: string;
  readonly body?: string;
  readonly tone?: ToastTone;
  /** Called after the toast is dismissed (button or timer). */
  readonly onDismiss?: () => void;
  /** Self-dismiss window in ms; zero keeps the toast until dismissed. */
  readonly autoDismissMs?: number;
  readonly className?: string;
}

export function Toast({
  title,
  body,
  tone = 'info',
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  className,
}: ToastProps) {
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    // Claim, not convenience: reduced motion means no timer is ever created.
    if (reduced || dismissed || autoDismissMs <= 0) return;
    const timer = setTimeout(dismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, dismissed, dismiss, reduced]);

  if (dismissed) return null;

  const animate = !reduced && motionOk('transition');

  return (
    <>
      <style data-ds-motion="toast-css" dangerouslySetInnerHTML={{ __html: motionToastCss }} />
      <div
        role="status"
        aria-live="polite"
        data-ds-motion="toast"
        data-tone={tone}
        className={classes('ds-motion-toast', animate ? 'motion-toast-in' : undefined, className)}
        style={{
          display: 'flex',
          gap: raw.space.s3,
          alignItems: 'flex-start',
          background: tokens.surface.primary,
          color: tokens.text.primary,
          border: `1px solid ${raw.color.ink100}`,
          borderLeft: `${raw.space.s1} solid ${TONE_EDGE[tone]}`,
          borderRadius: raw.radius.md,
          padding: raw.space.s3,
          maxWidth: '32rem',
          fontFamily: raw.type.familyText,
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1, flex: 1 }}>
          <strong style={{ fontSize: '0.875rem' }}>{title}</strong>
          {body !== undefined ? (
            <span style={{ fontSize: '0.8125rem', color: tokens.text.secondary }}>{body}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={`Dismiss notification: ${title}`}
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
          Dismiss
        </button>
      </div>
    </>
  );
}
