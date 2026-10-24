import { raw } from '@nastech/design-tokens';

export type SortDirection = 'ascending' | 'descending' | 'none';

export interface SortableHeaderProps {
  label: string;
  /** The direction this column is currently sorted in; `none` is "click to sort ascending". */
  dir: SortDirection;
  onToggle: () => void;
}

/**
 * The interactive half of a sortable `th`. `aria-sort` belongs on the `th` element, not the
 * button, so the table — not this file — sets it; what lives here is the control itself:
 * a real button (Enter/Space work for free), a text arrow indicator, and a `data-sort-dir`
 * hook so styling never depends on colour alone. A screen-reader user hears label + direction
 * from the table semantics, which is why the arrow glyph is aria-hidden.
 */
export function SortableHeader({ label, dir, onToggle }: SortableHeaderProps) {
  const glyph = dir === 'ascending' ? '↑' : dir === 'descending' ? '↓' : '↕';
  return (
    <button
      type="button"
      className="ds-sortable-header"
      data-sort-dir={dir}
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: raw.space.s1,
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        fontWeight: 600,
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      {label}
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
