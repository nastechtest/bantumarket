import { raw, tokens } from '@nastech/design-tokens';

export type TimelineState = 'done' | 'current' | 'upcoming';

export interface TimelineEntry {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  /** ISO-8601 instant; rendered through `<time>` so the machine value survives translation. */
  readonly at?: string;
  readonly state: TimelineState;
}

/**
 * Order and dispute histories are timelines of facts that already happened, so the vocabulary is
 * fixed by the ledger's real states upstream — this component takes labels, never invents them.
 * `aria-current="step"` marks the live state; `data-state` carries the visual; the ✓ glyph marks
 * history. Colour is never the only carrier — that is the same rule the committed Stepper holds.
 */
export function Timeline({ entries, label }: { entries: readonly TimelineEntry[]; label: string }) {
  return (
    <ol
      className="ds-timeline"
      aria-label={label}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        fontFamily: raw.type.familyText,
        fontSize: '0.875rem',
      }}
    >
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-state={entry.state}
          {...(entry.state === 'current' ? { 'aria-current': 'step' as const } : {})}
          style={{
            display: 'flex',
            gap: raw.space.s3,
            color: entry.state === 'upcoming' ? tokens.text.disabled : tokens.text.primary,
          }}
        >
          <span aria-hidden="true" style={{ width: raw.space.s5, textAlign: 'right' }}>
            {entry.state === 'done' ? '✓' : entry.state === 'current' ? '●' : '○'}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
            <strong style={{ fontWeight: entry.state === 'current' ? 600 : 400 }}>{entry.label}</strong>
            {entry.detail ? <span style={{ color: tokens.text.secondary }}>{entry.detail}</span> : null}
            {entry.at ? (
              <time dateTime={entry.at} style={{ color: tokens.text.secondary, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                {entry.at}
              </time>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
