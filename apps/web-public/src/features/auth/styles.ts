/**
 * Shared inline styles for the auth screens.
 *
 * Inline, not CSS-in-JS and not a stylesheet import, for one reason: this is the critical route.
 * Every byte that ships is a byte a buyer on 3G pays for; a $100 Android renders these before the
 * first tap. If the design-system stylesheet lands before launch, `styles.ts` is the swap point.
 */
import { raw, tokens } from '@nastech/design-tokens';
import type { CSSProperties } from 'react';

export const S = {
  page: {
    maxWidth: '26rem',
    margin: '0 auto',
    padding: `${raw.space.s5} ${raw.space.s4}`,
    fontFamily: raw.type.familyText,
    color: tokens.text.primary,
    display: 'flex',
    flexDirection: 'column',
    gap: raw.space.s4,
  },
  h1: { fontSize: '1.375rem', margin: 0, fontFamily: raw.type.familyDisplay },
  p: { margin: 0, fontSize: '0.9375rem', color: tokens.text.secondary, lineHeight: 1.5 },
  primary: {
    background: tokens.action.default,
    color: tokens.surface.primary,
    border: 'none',
    borderRadius: raw.radius.md,
    padding: `${raw.space.s3} ${raw.space.s4}`,
    fontSize: '1rem',
    fontFamily: raw.type.familyText,
    fontWeight: 600,
    minWidth: '100%',
    minHeight: '48px',
  },
  disabled: {
    background: raw.color.ink100,
    color: raw.color.ink300,
    border: 'none',
    borderRadius: raw.radius.md,
    padding: `${raw.space.s3} ${raw.space.s4}`,
    fontSize: '1rem',
    minWidth: '100%',
    minHeight: '48px',
  },
  linkish: {
    background: 'none',
    border: 'none',
    color: tokens.action.default,
    textDecoration: 'underline',
    fontSize: '0.9375rem',
    padding: `${raw.space.s2} 0`,
    fontFamily: raw.type.familyText,
    minHeight: '44px',
  },
  /** Error/caution surfaces are boxes, not colours alone — colour-blind readers need the frame. */
  alert: {
    border: `1px solid ${raw.color.signalNegative}`,
    borderRadius: raw.radius.md,
    padding: raw.space.s3,
    color: raw.color.signalNegative,
    fontSize: '0.9375rem',
    margin: 0,
  },
  info: {
    border: `1px solid ${raw.color.ink100}`,
    borderRadius: raw.radius.md,
    padding: raw.space.s3,
    color: tokens.text.secondary,
    fontSize: '0.875rem',
    margin: 0,
  },
} as const;

/** Touch targets ≥44px: this form gets used on a moving taxi, with one thumb, in sunlight. */
export function buttonStyle(enabled: boolean): CSSProperties {
  return enabled ? { ...S.primary, cursor: 'pointer' } : { ...S.disabled, cursor: 'not-allowed' };
}
