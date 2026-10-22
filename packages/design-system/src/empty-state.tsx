import { raw, tokens } from '@nastech/design-tokens';

/**
 * Zero results in a one-city watch pilot is a supply signal, not a dead end: staff must be able
 * to tell "buyer found nothing" apart from "page failed to load", hence `data-variant` and the
 * literal echo of the query. One action, phrased as broadening — "no results" pages that offer
 * three buttons offer none.
 */
export function EmptyState({
  query,
  actionLabel,
  onAction,
}: {
  query: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section
      className="ds-empty"
      data-variant="zero-results"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        alignItems: 'flex-start',
        padding: raw.space.s5,
        background: tokens.surface.raised,
        borderRadius: raw.radius.md,
        fontFamily: raw.type.familyText,
      }}
    >
      <h2 style={{ margin: 0, color: tokens.text.primary, fontFamily: raw.type.familyDisplay, fontSize: '1.25rem' }}>
        Nothing found for “{query}”
      </h2>
      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>
        Few sellers have listed yet. Try removing a filter or widening the words.
      </p>
      <button
        type="button"
        onClick={onAction}
        style={{
          background: tokens.action.default,
          color: tokens.text.onInverse,
          border: 'none',
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s4}`,
          fontSize: '0.875rem',
          cursor: 'pointer',
        }}
      >
        {actionLabel}
      </button>
    </section>
  );
}
