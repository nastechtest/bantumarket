import type { ReactNode } from 'react';
import { EmptyIllustration } from './empty-illustration.js';
import { OFFLINE_HEADLINE, offlineNotice } from '../lib/online.js';

/**
 * Chrome states features render into. They are deliberately complete sentences rather than
 * spinners: a seller on a data queue needs to know whether to wait, retry, or do something else.
 */

export function LoadingState({
  title = 'Loading',
  detail,
}: {
  readonly title?: string;
  readonly detail?: string;
}) {
  return (
    <div className="nt-state nt-state--loading" role="status" aria-live="polite" aria-busy="true">
      <span className="nt-state__pulse" aria-hidden="true" />
      <p className="nt-state__title">{title}…</p>
      {detail === undefined ? null : <p className="nt-state__body">{detail}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly children?: ReactNode;
}) {
  return (
    <section className="nt-state nt-state--empty" aria-label={title}>
      <EmptyIllustration />
      <h2 className="nt-state__title">{title}</h2>
      <p className="nt-state__body">{body}</p>
      {children === undefined ? null : <div className="nt-state__actions">{children}</div>}
    </section>
  );
}

export function ErrorState({
  title = 'This screen could not load',
  body,
  reference,
  onRetry,
  retryLabel = 'Try again',
  children,
}: {
  readonly title?: string;
  readonly body: string;
  readonly reference?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="nt-state nt-state--error" role="alert">
      <h2 className="nt-state__title">{title}</h2>
      <p className="nt-state__body">{body}</p>
      {reference === undefined ? null : (
        <p className="nt-state__reference">
          Reference for support: <code>{reference}</code>
        </p>
      )}
      {onRetry === undefined ? null : (
        <div className="nt-state__actions">
          <button type="button" className="nt-button" onClick={onRetry}>
            {retryLabel}
          </button>
        </div>
      )}
      {children === undefined ? null : <div className="nt-state__actions">{children}</div>}
    </div>
  );
}

export function OfflineState({ onRetry }: { readonly onRetry?: () => void }) {
  const notice = offlineNotice(false);
  return (
    <div className="nt-state nt-state--offline" role="status" aria-live="polite">
      <h2 className="nt-state__title">{OFFLINE_HEADLINE}</h2>
      <p className="nt-state__body">{notice?.replace(`${OFFLINE_HEADLINE}. `, '')}</p>
      {onRetry === undefined ? null : (
        <div className="nt-state__actions">
          <button type="button" className="nt-button nt-button--secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function RedirectingState({ to }: { readonly to: string }) {
  return (
    <div className="nt-state nt-state--redirect" role="status" aria-live="polite">
      <h2 className="nt-state__title">Taking you to sign in</h2>
      <p className="nt-state__body">
        This screen needs a confirmed seller session. After signing in you will come back to it.
      </p>
      <p className="nt-state__actions">
        <a className="nt-button" href={to}>
          Continue to sign in
        </a>
      </p>
    </div>
  );
}
