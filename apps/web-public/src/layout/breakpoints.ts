import { raw, tokens } from '@nastech/design-tokens';

/**
 * The only breakpoint table in the app.
 *
 * `lg` is 880px because that is the number already in the controller-owned `styles.css` hero
 * media query — divergence here means the header goes desktop while the page is still mobile.
 * `xl` is derived from the layout token, not typed: contentMax is the last breakpoint because a
 * layout wider than the content is just gutters.
 * The base device is 320px (the 2019-era Android the brief names); nothing below it is a
 * breakpoint, it is a bug.
 */
export const breakpoints = {
  xs: 320,
  sm: 480,
  md: 740,
  lg: 880,
  xl: Number.parseInt(tokens.layout.contentMax, 10),
} as const;

export type BreakpointName = keyof typeof breakpoints;
export const BREAKPOINT_NAMES: BreakpointName[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export function minWidth(name: BreakpointName): string {
  return `(min-width: ${breakpoints[name]}px)`;
}

export function maxWidth(name: BreakpointName): string {
  return `(max-width: ${breakpoints[name] - 1}px)`;
}

/** Desktop-first chrome (full nav, hover states) from `md` up; below that the tab bar owns nav. */
export const DESKTOP_QUERY = minWidth('md');
export const COMPACT_QUERY = maxWidth('md');

/** Touch target floor: the token scale has no 44px step, so the rule is "first step ≥ 44px". */
export function px(value: string): number {
  return Number.parseFloat(value);
}

const SPACE_STEPS: string[] = Object.values(raw.space);
export const TAP_TARGET_PX: number = SPACE_STEPS.map(px).find((v) => v >= 44) ?? 48;
