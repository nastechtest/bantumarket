export type NavGlyph =
  | 'dashboard'
  | 'listings'
  | 'sales'
  | 'payouts'
  | 'messages'
  | 'settings'
  | 'dot';

/**
 * Purely decorative glyphs, selected from the route path rather than stored on the route.
 * An unrecognised (new) route gets the neutral dot, so adding a route can never produce a nav
 * link without an icon — or a build error in the nav model.
 */
export function navGlyphFor(path: string): NavGlyph {
  switch (path) {
    case '/':
      return 'dashboard';
    case '/listings':
      return 'listings';
    case '/orders':
      return 'sales';
    case '/payouts':
      return 'payouts';
    case '/messages':
      return 'messages';
    case '/settings':
      return 'settings';
    default:
      return 'dot';
  }
}

function GlyphPath({ glyph }: { readonly glyph: NavGlyph }) {
  switch (glyph) {
    case 'dashboard':
      return (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </>
      );
    case 'listings':
      return (
        <>
          <path d="M4 4h7l9 9-7 7-9-9V4z" />
          <circle cx="8.5" cy="8.5" r="1.2" />
        </>
      );
    case 'sales':
      return (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
          <path d="M9 8h6M9 12h6" />
        </>
      );
    case 'payouts':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v10M9 9.5c0-1.4 1.4-2.5 3-2.5s3 1.1 3 2.5-1.4 2-3 2.5-3 1.1-3 2.5 1.4 2.5 3 2.5 3-1.1 3-2.5" />
        </>
      );
    case 'messages':
      return (
        <>
          <path d="M4 5h16v11H9l-5 4V5z" />
          <path d="M8 9h8M8 12h5" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        </>
      );
    case 'dot':
      return <circle cx="12" cy="12" r="4" />;
  }
}

export function NavIcon({ glyph, size = 20 }: { readonly glyph: NavGlyph; readonly size?: number }) {
  return (
    <svg
      className="nt-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <GlyphPath glyph={glyph} />
    </svg>
  );
}

export function BrandMark({ size = 26 }: { readonly size?: number }) {
  return (
    <svg
      className="nt-brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="10.5" />
      <path d="M16 10v6l4 2" />
      <path d="M9 3.5h14M9 28.5h14" />
    </svg>
  );
}
