import { raw, tokens } from '@nastech/design-tokens';

export interface PaginationProps {
  page: number;
  pageCount: number;
  onNavigate: (page: number) => void;
  /** Pages shown on each side of the current one; ends are always shown. */
  siblingCount?: number;
}

function buildWindow(page: number, pageCount: number, siblings: number): Array<number | 'gap'> {
  const keep = new Set<number>([1, pageCount]);
  for (let offset = -siblings; offset <= siblings; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= pageCount) keep.add(candidate);
  }
  const sorted = [...keep].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  let previous = 0;
  for (const value of sorted) {
    if (value - previous > 1) out.push('gap');
    out.push(value);
    previous = value;
  }
  return out;
}

/**
 * Pagination as `nav` with a button list — buttons because navigating a queue is an action on
 * live state, not a link destination a right-click could open. The current page carries
 * `aria-current="page"`; prev/next are `disabled` at the ends rather than hidden, so their
 * position in the reading order never shifts. Gap markers are aria-hidden text, never a
 * clickable "…".
 */
export function Pagination({ page, pageCount, onNavigate, siblingCount = 1 }: PaginationProps) {
  if (pageCount <= 1) return null;
  const window = buildWindow(page, pageCount, siblingCount);
  const buttonStyle = {
    background: 'none',
    border: `1px solid ${raw.color.ink100}`,
    borderRadius: raw.radius.sm,
    color: tokens.text.primary,
    padding: `${raw.space.s1} ${raw.space.s2}`,
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    cursor: 'pointer',
  } as const;

  return (
    <nav className="ds-pagination" aria-label="Pagination" style={{ fontFamily: raw.type.familyText }}>
      <ul style={{ display: 'flex', gap: raw.space.s2, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
        <li>
          <button type="button" onClick={() => onNavigate(page - 1)} disabled={page <= 1} aria-label="Previous page" style={buttonStyle}>
            ‹ Prev
          </button>
        </li>
        {window.map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" style={{ color: tokens.text.disabled, padding: raw.space.s1 }}>
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                onClick={() => {
                  if (entry !== page) onNavigate(entry);
                }}
                aria-label={`Page ${entry}`}
                {...(entry === page ? { 'aria-current': 'page' as const } : {})}
                style={{
                  ...buttonStyle,
                  ...(entry === page
                    ? { background: tokens.surface.raised, borderColor: raw.color.ink300, cursor: 'default' }
                    : {}),
                }}
              >
                {entry}
              </button>
            </li>
          ),
        )}
        <li>
          <button type="button" onClick={() => onNavigate(page + 1)} disabled={page >= pageCount} aria-label="Next page" style={buttonStyle}>
            Next ›
          </button>
        </li>
      </ul>
    </nav>
  );
}
