import { raw, tokens } from '@nastech/design-tokens';
import { SORT_OPTIONS } from '../types.js';
import type { SortKey } from '../types.js';

/**
 * Sort selection. A native `select` on purpose: at 320px it is the cheapest control that is
 * already thumb-sized, keyboard-operable, and screen-reader-correct — inventing a custom menu
 * here would spend first-paint bytes to be worse at the same job.
 */
export function SortControl({
  value,
  onChange,
}: {
  readonly value: SortKey;
  readonly onChange: (next: SortKey) => void;
}) {
  const selectId = 'search-sort';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: raw.space.s2, fontFamily: raw.type.familyText }}>
      <label htmlFor={selectId} style={{ fontSize: '0.8125rem', color: tokens.text.secondary }}>
        Sort
      </label>
      <select
        id={selectId}
        name="sort"
        value={value}
        // onInput (fires on select per HTML spec) because React's ChangeEventPlugin is inert
        // under bun+jsdom; see search-bar.tsx for the full note.
        onInput={(event) => {
          const next = event.currentTarget.value;
          const match = SORT_OPTIONS.find((option) => option.value === next);
          // Only a known sort may leave this control; a browser autofill cannot inject a new one.
          if (match !== undefined) onChange(match.value);
        }}
        style={{
          minHeight: 44,
          border: `1px solid ${raw.color.ink100}`,
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s3}`,
          fontSize: '0.9375rem',
          background: tokens.surface.primary,
          color: tokens.text.primary,
          fontFamily: raw.type.familyText,
        }}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
