import { Skeleton } from '../feedback/skeleton.js';

/**
 * Placeholder rows while a table loads. Each `td` keeps the real column count so the loading
 * shape *is* the loaded shape — no layout jump when data lands, which is the state change an
 * animation must never paper over. The row itself is aria-hidden (skeleton rule); the table
 * wrapper announces busyness via `aria-busy` on the scroll container in `Table`.
 */
export function LoadingRow({ columns, rows = 1 }: { columns: number; rows?: number }) {
  const cells = Array.from({ length: Math.max(1, columns) });
  return (
    <>
      {Array.from({ length: Math.max(1, rows) }).map((_, rowIndex) => (
        <tr key={rowIndex} data-ds-loading-row="" aria-hidden="true">
          {cells.map((__, cellIndex) => (
            <td key={cellIndex} style={{ padding: 0, lineHeight: 0 }}>
              <Skeleton width={`${90 - (cellIndex % 3) * 20}%`} label={`row ${rowIndex + 1} column ${cellIndex + 1}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
