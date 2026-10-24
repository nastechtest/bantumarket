import { raw, tokens } from '@nastech/design-tokens';

export interface NotFoundProps {
  /** The address that 404s, echoed verbatim — the user must be able to see what was requested. */
  path: string;
  /** One way out that is a real destination in this pilot: browse or search. */
  homeHref?: string;
}

/**
 * The 404. A listing URL that dies is usually a sold or pulled item, so the copy says what a
 * missing page can honestly say (it is not here; it may have been sold) instead of promising
 * "it will be back". The path echo is the debugging half — a user reporting "I typed this and
 * got nothing" is a supply signal, the same reason `EmptyState` echoes queries.
 */
export function NotFoundPage({ path, homeHref = '/' }: NotFoundProps) {
  return (
    <main
      className="ds-not-found"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: raw.space.s3,
        padding: raw.space.s6,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
        maxWidth: tokens.layout.contentMax,
      }}
    >
      <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.5rem' }}>There is nothing at this address</h1>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>
        The item may have been sold or taken down — on this pilot, pages disappear when stock does.
      </p>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>
        Requested: <code style={{ fontFamily: raw.type.familyMono }}>{path}</code>
      </p>
      <a
        href={homeHref}
        style={{
          background: tokens.action.default,
          color: tokens.text.onInverse,
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s4}`,
          fontSize: '0.875rem',
          textDecoration: 'none',
        }}
      >
        Browse what is listed
      </a>
    </main>
  );
}
