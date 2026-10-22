/**
 * Focus ring — where motion meets accessibility.
 *
 * The rule this encodes: a keyboard user must never lose the ring to an animation. That is
 * enforced structurally, not by discipline — the ring is a plain `outline` with no
 * transition or animation property anywhere in its CSS, and the reduced-motion block in
 * css-vars zeroes durations, which could never have touched the ring in the first place.
 * An outline cannot be "missed because it faded in".
 */

import { tokens } from '@nastech/design-tokens';

export const focusRing = {
  widthPx: 2,
  /** 2px keeps the ring clear of 1px component borders without detaching it from the control. */
  offsetPx: 2,
  /** Same semantic token the action surfaces use — the ring is brand, not browser chrome. */
  color: tokens.action.default,
} as const;

/**
 * Generated rather than hand-written so apps/web-public's stylesheet and any future app
 * consume one source. Deliberately contains no `transition` or `animation` — a test in
 * tests/css-vars.test.ts holds that line.
 */
export const FOCUS_RING_CSS = `/* @nastech/motion — focus ring. Never animated; never removed. */
:focus-visible {
  outline: ${focusRing.widthPx}px solid var(--focus-ring-color, ${focusRing.color});
  outline-offset: ${focusRing.offsetPx}px;
}
@media (forced-colors: active) {
  :focus-visible { outline-color: Highlight; }
}`;
