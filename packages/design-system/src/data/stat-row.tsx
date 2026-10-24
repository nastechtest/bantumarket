import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export interface Stat {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
}

/**
 * Dashboard figures: label above, number below, tabular numerals so a refreshing queue does not
 * jitter. Built on `dl` for the same reason as DescriptionList — a figure is a pairing, and the
 * hint (delta, caption) stays inside the `dd` so it is announced with the number, not after it.
 */
export function StatRow({ stats, label }: { stats: readonly Stat[]; label?: string }) {
  return (
    <dl
      className="ds-stat-row"
      {...(label ? { 'aria-label': label } : {})}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: raw.space.s5,
        margin: 0,
        fontFamily: raw.type.familyText,
      }}
    >
      {stats.map((stat) => (
        <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
          <dt style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem', fontWeight: 600 }}>
            {stat.label}
          </dt>
          <dd
            style={{
              margin: 0,
              color: tokens.text.primary,
              fontSize: '1.5rem',
              fontFamily: raw.type.familyDisplay,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {stat.value}
            {stat.hint ? (
              <span style={{ display: 'block', fontSize: '0.8125rem', fontFamily: raw.type.familyText, color: tokens.text.secondary }}>
                {stat.hint}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
