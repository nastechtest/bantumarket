import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { LAYER } from '../overlay/layer.js';
import { POLICY_LINKS } from '../policy-links.js';

export interface ConsentBannerFrameProps {
  /** Heading — the banner names what it is about; "We value your privacy" says nothing. */
  title: string;
  /** What the user is being asked, in one sentence the caller owns (purpose list is a legal text). */
  ask: string;
  onAccept: () => void;
  onDecline: () => void;
  /**
   * Optional extra body (the purpose table for non-essential cookies). The frame does not render
   * a pre-ticked anything, anywhere: consent controls are the buttons below, not a checkbox
   * state we would have to defend to the regulator.
   */
  children?: ReactNode;
}

/**
 * The frame every consent surface mounts in. The three things that make a consent banner lawful
 * rather than theatre, encoded structurally:
 *  1. Accept and decline are siblings with identical styling — a greyed-out, smaller "reject" is
 *     a dark pattern, and the guard test can see the class equality even when it cannot see
 *     colour.
 *  2. It is a `region`, not a dialog: no focus trap, no inert background. The page keeps working
 *     while the question is open, because consent cannot be coerced by blocking the flow.
 *  3. The policy links are the committed `POLICY_LINKS` hrefs — the banner points at the real
 *     POPIA notice, not a second copy that drifts.
 */
export function ConsentBannerFrame({ title, ask, onAccept, onDecline, children }: ConsentBannerFrameProps) {
  const buttonBase = {
    borderRadius: raw.radius.sm,
    padding: `${raw.space.s2} ${raw.space.s4}`,
    fontSize: '0.875rem',
    cursor: 'pointer' as const,
  };
  return (
    <section
      className="ds-consent-banner"
      aria-label={title}
      style={{
        position: 'fixed',
        left: raw.space.s4,
        right: raw.space.s4,
        bottom: raw.space.s4,
        zIndex: LAYER.banner,
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        background: tokens.surface.primary,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.lg,
        padding: raw.space.s4,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
        maxWidth: tokens.layout.contentMax,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <h2 style={{ margin: 0, fontSize: '1rem', fontFamily: raw.type.familyDisplay }}>{title}</h2>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>{ask}</p>
      {children}
      <div style={{ display: 'flex', gap: raw.space.s3, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="ds-consent-banner__action"
          data-choice="accept"
          onClick={onAccept}
          style={{ ...buttonBase, background: tokens.action.default, color: tokens.text.onInverse, border: 'none' }}
        >
          Accept
        </button>
        <button
          type="button"
          className="ds-consent-banner__action"
          data-choice="decline"
          onClick={onDecline}
          style={{ ...buttonBase, background: 'none', color: tokens.text.primary, border: `1px solid ${raw.color.ink300}` }}
        >
          Decline
        </button>
        <nav aria-label="Privacy information" style={{ marginLeft: 'auto', display: 'flex', gap: raw.space.s3 }}>
          {POLICY_LINKS.map((link) => (
            <a key={link.key} href={link.href} style={{ color: tokens.text.secondary, fontSize: '0.8125rem', textDecoration: 'underline' }}>
              {link.text}
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
