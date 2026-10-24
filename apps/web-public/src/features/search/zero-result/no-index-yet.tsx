import { ApiError } from '@nastech/api-client';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * The failed-search screen. Different words from zero results, on purpose, in both directions:
 * it never says "nothing matched" and it never shows a count. The index being down is our bug,
 * and the copy says so — the buyer should not walk away believing the pilot has no stock, and
 * the supply plan must not record this session as a demand miss.
 *
 * The per-kind message comes from `ApiError.message`, which the api-client builds from its
 * static safety table; nothing from a response body ever reaches the screen.
 */
export function NoIndexYet({
  error,
  onRetry,
}: {
  readonly error: ApiError | null;
  readonly onRetry: () => void;
}) {
  return (
    <section
      data-variant="search-failed"
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        alignItems: 'flex-start',
        padding: raw.space.s5,
        background: tokens.surface.primary,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        fontFamily: raw.type.familyText,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.25rem', color: tokens.text.primary }}>
        Search is not answering
      </h2>
      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.9375rem' }}>
        This is a problem on our side, not a shortage of listings. Nothing you typed matched
        <em> nothing</em> — we simply could not ask the question. Your filters are kept exactly
        as you set them.
      </p>
      {error !== null ? (
        <p data-error-kind={error.kind} style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
          {error.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        style={{
          minHeight: 44,
          background: tokens.action.default,
          color: tokens.text.onInverse,
          border: 'none',
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s4}`,
          fontSize: '0.9375rem',
          cursor: 'pointer',
        }}
      >
        Try the search again
      </button>
    </section>
  );
}
