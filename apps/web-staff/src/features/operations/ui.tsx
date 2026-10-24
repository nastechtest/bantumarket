import type { CSSProperties, ReactNode } from 'react';
import { formatCents } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * Small pieces shared by the operations screens. They are deliberately local to this feature:
 * a table, a status tag and a money cell are not a design-system package, and the screens here
 * are the only consumers. Money still goes through `formatCents`, the repo's integer-cent helper.
 */

const bodyText: CSSProperties = { fontFamily: raw.type.familyText, fontSize: '0.875rem', color: tokens.text.primary };

export function Intro({ children }: { children: ReactNode }) {
  return (
    <p style={{ ...bodyText, color: tokens.text.secondary, margin: 0, maxWidth: '72ch', lineHeight: 1.55 }}>
      {children}
    </p>
  );
}

export type Tone = 'neutral' | 'positive' | 'caution' | 'negative' | 'info';

const TONE_COLOUR: Readonly<Record<Tone, string>> = {
  neutral: tokens.text.secondary,
  positive: tokens.assurance.disclosed,
  caution: raw.color.signalCaution,
  negative: raw.color.signalNegative,
  info: tokens.action.default,
};

export function StatusTag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        color: TONE_COLOUR[tone],
        border: `1px solid ${TONE_COLOUR[tone]}`,
        borderRadius: raw.radius.pill,
        padding: `1px ${raw.space.s2}`,
        fontSize: '0.75rem',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function Reference({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: raw.type.familyMono, fontSize: '0.8125rem', color: tokens.text.secondary }}>
      {children}
    </span>
  );
}

export function Amount({ cents, refunded = false }: { cents: number; refunded?: boolean }) {
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {refunded ? `(${formatCents(Math.abs(cents))})` : formatCents(cents)}
    </span>
  );
}

/**
 * A payout destination is shown the way a bank statement shows it: institution and the last four
 * digits only. There is no prop for a full account number, so a screen cannot pass one by accident.
 */
export function MaskedAccount({ bank, last4 }: { bank: string; last4: string }) {
  return (
    <span aria-label={`${bank} account ending ${last4}`} style={{ whiteSpace: 'nowrap' }}>
      {bank} •••• {last4}
    </span>
  );
}

export interface Stat {
  readonly label: string;
  readonly value: string;
  readonly tone?: Tone;
}

export function StatStrip({ items }: { items: readonly Stat[] }) {
  return (
    <dl
      aria-label="Summary"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
        gap: raw.space.s3,
        margin: 0,
        ...bodyText,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: raw.space.s1,
            padding: raw.space.s3,
            background: tokens.surface.raised,
            border: `1px solid ${raw.color.ink100}`,
            borderRadius: raw.radius.md,
          }}
        >
          <dt style={{ fontSize: '0.75rem', color: tokens.text.secondary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {item.label}
          </dt>
          <dd style={{ margin: 0, fontSize: '1.35rem', fontWeight: 600, color: item.tone ? TONE_COLOUR[item.tone] : tokens.text.primary }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => ReactNode;
  readonly align?: 'start' | 'end';
}

export interface DataTableProps<T> {
  readonly caption: string;
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
}

/**
 * Native table semantics with a required caption, because a console table is read by a person
 * scanning a column and by a screen reader announcing a row. The wrapper owns horizontal scroll so
 * the caption stays in the flow on a narrow screen.
 */
export function DataTable<T>({ caption, columns, rows, rowKey }: DataTableProps<T>) {
  return (
    <div style={{ overflowX: 'auto', fontFamily: raw.type.familyText }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem', color: tokens.text.primary }}>
        <caption style={{ textAlign: 'left', padding: `${raw.space.s2} 0`, fontWeight: 600, fontSize: '0.875rem' }}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  textAlign: column.align ?? 'start',
                  padding: `${raw.space.s2} ${raw.space.s3}`,
                  borderBottom: `1px solid ${raw.color.ink300}`,
                  whiteSpace: 'nowrap',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  color: tokens.text.secondary,
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    textAlign: column.align ?? 'start',
                    padding: `${raw.space.s2} ${raw.space.s3}`,
                    borderBottom: `1px solid ${raw.color.ink100}`,
                    verticalAlign: 'top',
                  }}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={{ color: tokens.action.default }}>
      {children}
    </a>
  );
}

export function TwoColumn({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: raw.space.s4, alignItems: 'start' }}>
      {children}
    </div>
  );
}
