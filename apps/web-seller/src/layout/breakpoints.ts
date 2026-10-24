import { raw, tokens } from '@nastech/design-tokens';

/**
 * The app's breakpoint table. `md` (740px) is where the seller sidebar replaces the compact
 * navigation; the stylesheet uses the same number. Base device is a 320px-class Android phone.
 */
export const breakpoints = {
  xs: 320,
  sm: 480,
  md: 740,
  lg: 900,
  xl: Number.parseInt(tokens.layout.contentMax, 10),
} as const;

export type BreakpointName = keyof typeof breakpoints;

export const BREAKPOINT_NAMES: readonly BreakpointName[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export function minWidth(name: BreakpointName): string {
  return `(min-width: ${breakpoints[name]}px)`;
}

export function maxWidth(name: BreakpointName): string {
  return `(max-width: ${breakpoints[name] - 1}px)`;
}

export const DESKTOP_QUERY = minWidth('md');
export const COMPACT_QUERY = maxWidth('md');

function px(value: string): number {
  return Number.parseFloat(value);
}

/** First step on the token spacing scale that clears the 44px touch floor (s7 = 48px). */
export const TAP_TARGET_PX: number = Object.values(raw.space)
  .map(px)
  .find((value) => value >= 44) ?? 48;
