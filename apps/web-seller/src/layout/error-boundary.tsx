import { Component, type ErrorInfo, type ReactNode } from 'react';
import { supportHref, type SupportContact } from '../lib/support.js';

/**
 * The last line of the seller shell. A route module that throws keeps the frame and every other
 * destination reachable; the seller is told what did *not* happen (nothing submitted, listed or
 * paid) rather than shown an error string that may contain a bank fragment from a failed save.
 * Reporting goes through `onError`; there is no third-party sink in this app's boot path.
 */

interface Props {
  readonly children: ReactNode;
  readonly support?: SupportContact | null;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  readonly failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    const support = this.props.support ?? null;
    return (
      <div className="nt-state nt-state--error" role="alert">
        <h2 className="nt-state__title">This seller screen stopped working</h2>
        <p className="nt-state__body">
          Nothing was submitted, listed, paid or changed while it was broken. Your listings, sales
          and payouts are as they were before this screen opened.
        </p>
        {support === null ? null : (
          <p className="nt-state__body">
            If it keeps happening,{' '}
            <a className="nt-help__link" href={supportHref(support)}>
              contact support ({support.display})
            </a>
            .
          </p>
        )}
        <div className="nt-state__actions">
          <button type="button" className="nt-button" onClick={this.reset}>
            Try this screen again
          </button>
          <button
            type="button"
            className="nt-button nt-button--secondary"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
