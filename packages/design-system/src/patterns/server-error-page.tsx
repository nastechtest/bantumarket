import { raw, tokens } from '@nastech/design-tokens';

export interface ServerErrorPageProps {
  /** The request correlation id when the transport supplied one; support starts here. */
  reference?: string;
  /** Retry must re-issue the request — the page never claims recovery it cannot see. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * The 5xx surface. What matters to the person standing there: whether to wait, whether to retry,
 * and what to tell support. So the copy never says "something went wrong" — it says our server
 * failed, their money state is untouched until proven otherwise, and here is the reference.
 * `role="alert"` because this replaces content the user asked for. A retry that fails renders a
 * fresh instance of this page, and the alert re-announces — that repetition is the honest signal
 * that nothing recovered yet.
 */
export function ServerErrorPage({ reference, onRetry, retryLabel = 'Try again' }: ServerErrorPageProps) {
  return (
    <main
      className="ds-server-error"
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s4,
        padding: raw.space.s6,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
        maxWidth: tokens.layout.contentMax,
      }}
    >
      <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.5rem' }}>Our server failed on this request</h1>
      <p style={{ margin: 0, fontSize: '0.875rem', maxWidth: '46rem' }}>
        This is a fault on our side, not on yours. If you were paying, listing or handing over,
        nothing has been confirmed — the order state is whatever it was before this page appeared.
      </p>
      {reference ? (
        <p style={{ margin: 0, fontSize: '0.8125rem' }}>
          Reference for support:{' '}
          <code style={{ fontFamily: raw.type.familyMono, background: tokens.surface.raised, padding: `${raw.space.s1} ${raw.space.s2}`, borderRadius: raw.radius.sm }}>
            {reference}
          </code>
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>No request reference was returned.</p>
      )}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            alignSelf: 'flex-start',
            background: tokens.action.default,
            color: tokens.text.onInverse,
            border: 'none',
            borderRadius: raw.radius.sm,
            padding: `${raw.space.s2} ${raw.space.s4}`,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {retryLabel}
        </button>
      ) : null}
    </main>
  );
}
