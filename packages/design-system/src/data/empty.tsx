import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export interface EmptyPanelProps {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Distinguishes "no rows yet" from "filtered to nothing" — staff act differently on each. */
  variant?: 'empty' | 'filtered' | 'error';
  children?: ReactNode;
}

/**
 * The generic no-data panel. The committed root `EmptyState` is the search zero-results surface
 * with its query echo (a supply signal); this one is for tables, queues and lists, so it takes
 * no query and carries a `data-variant` instead. Still exactly one action — a no-data panel
 * offering three buttons offers none.
 */
export function EmptyPanel({ title, body, actionLabel, onAction, variant = 'empty', children }: EmptyPanelProps) {
  return (
    <section
      className="ds-empty-panel"
      data-variant={variant}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: raw.space.s3,
        padding: raw.space.s5,
        background: tokens.surface.raised,
        borderRadius: raw.radius.md,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
      }}
    >
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.0625rem' }}>{title}</h3>
      {body ? <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>{body}</p> : null}
      {children}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            background: tokens.action.default,
            color: tokens.text.onInverse,
            border: 'none',
            borderRadius: raw.radius.sm,
            padding: `${raw.space.s2} ${raw.space.s4}`,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
