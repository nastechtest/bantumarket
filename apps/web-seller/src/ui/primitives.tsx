import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * Seller-feature presentation primitives. They are deliberately generic (a card, a status chip,
 * a table) so a screen composes real data rather than inventing another visual language. All
 * values come from the token package; inline styles are this app's convention.
 */

export const CARD: CSSProperties = {
  background: tokens.surface.primary,
  border: `1px solid ${raw.color.ink100}`,
  borderRadius: raw.radius.lg,
  padding: raw.space.s5,
  display: 'flex',
  flexDirection: 'column',
  gap: raw.space.s3,
};

export const MUTED: CSSProperties = {
  margin: 0,
  color: tokens.text.secondary,
  fontSize: '0.875rem',
  lineHeight: 1.55,
};

export const TAG: CSSProperties = {
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: tokens.text.secondary,
};

export type Tone = 'neutral' | 'progress' | 'success' | 'caution' | 'problem';

const TONE_COLOR: Readonly<Record<Tone, string>> = {
  neutral: raw.color.ink500,
  progress: raw.color.accent600,
  success: raw.color.signalPositive,
  caution: raw.color.signalCaution,
  problem: raw.color.signalNegative,
};

export function Panel({
  id,
  title,
  description,
  actions,
  tone = 'neutral',
  children,
}: {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly tone?: Tone;
  readonly children: ReactNode;
}) {
  const generated = useId();
  const headingId = `${id ?? generated}-title`;
  const border = tone === 'neutral' ? raw.color.ink100 : TONE_COLOR[tone];
  return (
    <section
      data-testid={id}
      aria-labelledby={headingId}
      style={{ ...CARD, ...(tone === 'neutral' ? {} : { borderColor: border }) }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: raw.space.s3,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 id={headingId} style={{ fontSize: '1.125rem' }}>
            {title}
          </h2>
          {description === undefined ? null : (
            <p style={{ ...MUTED, marginTop: raw.space.s1 }}>{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div style={{ display: 'flex', gap: raw.space.s2, flexWrap: 'wrap' }}>{actions}</div>
        )}
      </header>
      {children}
    </section>
  );
}

export function Chip({ tone = 'neutral', children }: { readonly tone?: Tone; readonly children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: raw.space.s1,
        border: `1px solid ${TONE_COLOR[tone]}`,
        color: TONE_COLOR[tone],
        borderRadius: raw.radius.pill,
        padding: `2px ${raw.space.s2}`,
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function KeyValue({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={TAG}>{label}</span>
      <span style={{ fontFamily: raw.type.familyText, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1, minWidth: '9rem' }}>
      <span style={TAG}>{label}</span>
      <span style={{ fontSize: '1.35rem', fontWeight: 600 }}>{value}</span>
      {detail === undefined ? null : <span style={{ ...MUTED, fontSize: '0.8125rem' }}>{detail}</span>}
    </div>
  );
}

export function Note({
  tone = 'neutral',
  title,
  children,
}: {
  readonly tone?: Tone;
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      role={tone === 'problem' || tone === 'caution' ? 'alert' : undefined}
      style={{
        borderTop: `1px solid ${TONE_COLOR[tone]}`,
        borderRight: `1px solid ${TONE_COLOR[tone]}`,
        borderBottom: `1px solid ${TONE_COLOR[tone]}`,
        borderLeft: `4px solid ${TONE_COLOR[tone]}`,
        borderRadius: raw.radius.md,
        padding: raw.space.s3,
        background: tokens.surface.primary,
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s1,
      }}
    >
      {title === undefined ? null : <strong>{title}</strong>}
      <div style={{ color: tokens.text.secondary, fontSize: '0.875rem', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function EmptyNote({ title, body, action }: { readonly title: string; readonly body: string; readonly action?: ReactNode }) {
  return (
    <div style={{ ...CARD, alignItems: 'flex-start' }}>
      <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h3>
      <p style={MUTED}>{body}</p>
      {action === undefined ? null : <div>{action}</div>}
    </div>
  );
}

export function InlineLink({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <a href={href} style={{ color: tokens.action.default, fontWeight: 600 }}>
      {children}
    </a>
  );
}

const TD: CSSProperties = {
  padding: `${raw.space.s2} ${raw.space.s3}`,
  borderBottom: `1px solid ${raw.color.ink100}`,
  verticalAlign: 'top',
};

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => ReactNode;
  readonly align?: 'start' | 'end';
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
}: {
  readonly caption: string;
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly empty?: ReactNode;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <caption style={{ textAlign: 'left', padding: `0 0 ${raw.space.s2}`, color: tokens.text.secondary, fontSize: '0.875rem' }}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={{
                  padding: `${raw.space.s2} ${raw.space.s3}`,
                  borderBottom: `1px solid ${raw.color.ink300}`,
                  textAlign: column.align ?? 'start',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8125rem',
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && empty !== undefined ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: raw.space.s4 }}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key} style={{ ...TD, textAlign: column.align ?? 'start' }}>
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
