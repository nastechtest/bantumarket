/**
 * Three framing pieces every panel in this feature shares, built straight off
 * `@nastech/design-tokens` rather than a class in `styles.css`.
 *
 * `styles.css` is controller-owned this wave, so a feature that needed a stylesheet would be asking
 * for an edit in somebody else's file; inline token styles are what the design system itself does,
 * and they keep this directory self-contained. `data-` attributes stay on the DOM so a staff screen
 * or a later audit can see what a panel was without reading the JS.
 */

import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export type PanelTone = 'neutral' | 'scope' | 'money' | 'action';

const EDGE: Record<PanelTone, string> = {
  neutral: raw.color.ink100,
  // The scope panels are the ones a buyer skims, so they get the caution edge and not a decorative
  // one — and never the positive colour, which would read as reassurance.
  scope: raw.color.signalCaution,
  money: raw.color.accent300,
  action: tokens.action.default,
};

export function Panel({
  tone = 'neutral',
  title,
  id,
  children,
  meta,
}: {
  tone?: PanelTone;
  title?: string;
  id?: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="dp-panel"
      data-tone={tone}
      {...(id !== undefined ? { id } : {})}
      style={{
        border: `1px solid ${EDGE[tone]}`,
        borderLeftWidth: 3,
        borderRadius: raw.radius.md,
        background: tokens.surface.primary,
        padding: raw.space.s4,
      }}
    >
      {title !== undefined ? (
        <h2
          style={{
            margin: 0,
            fontFamily: raw.type.familyDisplay,
            fontSize: '1.0625rem',
            fontWeight: 500,
            color: tokens.text.primary,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>
      ) : null}
      {meta !== undefined ? (
        <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontSize: '0.8125rem' }}>{meta}</p>
      ) : null}
      <div style={{ marginTop: title !== undefined ? raw.space.s3 : 0 }}>{children}</div>
    </section>
  );
}

export function Body({ children, size = 'base' }: { children: ReactNode; size?: 'base' | 'small' }) {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: raw.type.familyText,
        fontSize: size === 'small' ? '0.8125rem' : '0.9375rem',
        lineHeight: 1.55,
        color: tokens.text.primary,
      }}
    >
      {children}
    </p>
  );
}

/**
 * The only button shape this feature uses. `emphasis` picks a token-backed treatment rather than a
 * colour: a destructive-looking red on "decline the proposal" would imply a decision that a proposal
 * is not, so declining is deliberately secondary.
 */
export function ActionButton({
  children,
  onClick,
  emphasis = 'primary',
  disabled = false,
  type = 'button',
  id,
  ariaDescribedBy,
}: {
  children: ReactNode;
  onClick?: () => void;
  emphasis?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  type?: 'button' | 'submit';
  id?: string;
  ariaDescribedBy?: string | undefined;
}) {
  const base = {
    fontFamily: raw.type.familyText,
    fontSize: '0.9375rem',
    borderRadius: raw.radius.pill,
    padding: `${raw.space.s3} ${raw.space.s5}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid transparent',
    opacity: disabled ? 0.5 : 1,
  } as const;
  const treatment =
    emphasis === 'primary'
      ? { background: tokens.action.default, color: tokens.text.onInverse }
      : emphasis === 'secondary'
        ? { background: tokens.surface.primary, color: tokens.text.primary, border: `1px solid ${raw.color.ink100}` }
        : { background: 'transparent', color: tokens.text.secondary, border: `1px solid ${raw.color.ink100}` };

  return (
    <button
      type={type}
      id={id}
      {...(ariaDescribedBy !== undefined ? { 'aria-describedby': ariaDescribedBy } : {})}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...treatment }}
    >
      {children}
    </button>
  );
}

/** A labelled list of what-can-and-cannot-be-decided rows. Used by both rights panels so the two
 *  halves of the same boundary cannot be styled into different levels of importance. */
export function ScopeList({ items, variant }: { items: readonly string[]; variant: 'can' | 'cannot' }) {
  return (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'grid',
        gap: raw.space.s2,
        fontFamily: raw.type.familyText,
        fontSize: '0.9375rem',
      }}
      data-variant={variant}
    >
      {items.map((item) => (
        <li key={item} style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start', color: tokens.text.primary }}>
          <span aria-hidden="true" style={{ color: variant === 'can' ? raw.color.ink500 : raw.color.signalCaution, fontWeight: 600 }}>
            {variant === 'can' ? '—' : '✕'}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
