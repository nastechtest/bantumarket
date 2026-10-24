import { Component, type ErrorInfo, type ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { reportError } from './sentry-slot.js';
import { supportContact, supportHref, type SupportContact } from './support-number.js';

/**
 * The last line of the shell: if a route module throws at render, the buyer keeps the frame,
 * the money-path routes stay reachable, and the message says what happened — not "oops".
 *
 * Class component because React still has no hook for this. The reset path is *remount by key*,
 * not state gymnastics: the controller re-keys children after `reset()` on the next route
 * change, which is also why `onError` is exposed — the session layer may want to flush saves.
 */

interface Props {
  readonly children: ReactNode;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
  readonly support?: SupportContact | null;
}

interface State {
  readonly failed: { error: Error } | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: { error } };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { boundary: 'app-shell', componentStack: info.componentStack ?? 'none' });
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ failed: null });
  };

  override render(): ReactNode {
    const failed = this.state.failed;
    if (failed === null) return this.props.children;

    const support = this.props.support === undefined ? supportContact() : this.props.support;
    return (
      <div
        role="alert"
        style={{
          fontFamily: raw.type.familyText,
          color: tokens.text.primary,
          padding: `${raw.space.s6} ${raw.space.s4}`,
          maxWidth: 560,
          marginInline: 'auto',
        }}
      >
        <h2 style={{ fontSize: '1.3rem', lineHeight: 1.2, margin: 0 }}>This page hit a problem.</h2>
        <p style={{ color: tokens.text.secondary, lineHeight: 1.55 }}>
          Your account, orders and any item you were about to buy are unaffected — nothing was submitted while this
          page was broken.
        </p>
        <p style={{ color: tokens.text.secondary, lineHeight: 1.55 }}>
          {failed.error.message.length > 0 ? `The page said: “${failed.error.message}”.` : ''} Try reloading; if it
          keeps happening,{' '}
          {support === null ? (
            'support contact is being set up.'
          ) : (
            <a href={supportHref(support)} style={{ color: tokens.action.default }}>
              reach support ({support.display})
            </a>
          )}
        </p>
        <p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            style={{
              background: tokens.action.default,
              color: tokens.text.onInverse,
              border: 0,
              borderRadius: 'var(--nt-radius-pill)',
              padding: `${raw.space.s3} ${raw.space.s5}`,
              minHeight: 44,
              cursor: 'pointer',
            }}
          >
            Reload the page
          </button>
          <button
            type="button"
            onClick={this.reset}
            style={{
              background: 'transparent',
              color: tokens.text.primary,
              border: `1px solid ${raw.color.ink100}`,
              borderRadius: 'var(--nt-radius-pill)',
              padding: `${raw.space.s3} ${raw.space.s5}`,
              minHeight: 44,
              marginLeft: raw.space.s3,
              cursor: 'pointer',
            }}
          >
            Try again without reloading
          </button>
        </p>
      </div>
    );
  }
}
