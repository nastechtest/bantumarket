import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { SortableHeader } from './sortable-header.js';
import type { SortDirection } from './sortable-header.js';

export interface TableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => ReactNode;
  readonly sortable?: boolean;
  readonly align?: 'start' | 'end';
}

export interface TableSort {
  readonly key: string;
  readonly dir: 'ascending' | 'descending';
}

export interface TableProps<T> {
  caption: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  sort?: TableSort | null;
  onSortChange?: (next: TableSort) => void;
  /** Async rows in flight — announces `aria-busy` so a reader says "loading", not "empty". */
  busy?: boolean;
  emptyState?: ReactNode;
}

/**
 * The staff queue and seller payouts are real tables; a div-grid with aria roles bolted on is
 * how screen-reader users get "row 3 column undefined". This is native `table` semantics:
 * `caption` (required — an uncaptioned data table is unidentifiable in a reading pass),
 * `th scope="col"`, and `aria-sort` set on the `th` by the table, never by a cell component.
 * Horizontal scroll on narrow screens goes on the wrapper so the caption stays in flow.
 */
export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  sort = null,
  onSortChange,
  busy = false,
  emptyState,
}: TableProps<T>) {
  const nextDir = (key: string): SortDirection => {
    if (!sort || sort.key !== key) return 'none';
    return sort.dir;
  };

  const toggle = (key: string): void => {
    if (!onSortChange) return;
    const current = sort && sort.key === key ? sort.dir : null;
    onSortChange({ key, dir: current === 'ascending' ? 'descending' : 'ascending' });
  };

  return (
    <div className="ds-table-scroll" aria-busy={busy} style={{ overflowX: 'auto', fontFamily: raw.type.familyText }}>
      <table
        className="ds-table"
        style={{ borderCollapse: 'collapse', width: '100%', color: tokens.text.primary, fontSize: '0.875rem' }}
      >
        <caption
          style={{
            textAlign: 'left',
            padding: `${raw.space.s2} ${raw.space.s3}`,
            fontFamily: raw.type.familyDisplay,
            fontSize: '1rem',
            color: tokens.text.primary,
          }}
        >
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const dir = column.sortable ? nextDir(column.key) : 'none';
              return (
                <th
                  key={column.key}
                  scope="col"
                  {...(column.sortable && sort && sort.key === column.key
                    ? { 'aria-sort': sort.dir as 'ascending' | 'descending' }
                    : {})}
                  style={{
                    textAlign: column.align ?? 'start',
                    padding: `${raw.space.s2} ${raw.space.s3}`,
                    borderBottom: `1px solid ${raw.color.ink300}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {column.sortable ? (
                    <SortableHeader label={column.header} dir={dir} onToggle={() => toggle(column.key)} />
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyState ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: raw.space.s4 }}>
                {emptyState}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      textAlign: column.align ?? 'start',
                      padding: `${raw.space.s2} ${raw.space.s3}`,
                      borderBottom: `1px solid ${raw.color.ink100}`,
                    }}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
