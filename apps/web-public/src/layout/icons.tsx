import type { ReactNode } from 'react';

/**
 * The chrome's icon set: inline SVG, currentColor, 20px, aria-hidden (the label is always in
 * text next to it — an icon that needs its own accessible name is a design smell). This is
 * deliberately the *entire* icon budget for the shell; "a handful of glyphs" is literal.
 * No icon font: it would be a render-blocking request and a screen-reader noise generator.
 */

interface IconProps {
  readonly size?: number;
}

function Svg({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h11V10.5" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.6 15.6 4.4 4.4" />
    </Svg>
  );
}

export function IconAccount(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M5.5 19.5c1.4-2.6 3.8-4 6.5-4s5.1 1.4 6.5 4" />
    </Svg>
  );
}

export function IconTag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4h7.2l8.8 8.8-7.2 7.2L4 11.2Z" />
      <circle cx="9" cy="9" r="1.4" />
    </Svg>
  );
}

/** Brand mark: a watch dial with a single hairline — our pilot subject, and our whole pitch. */
export function BrandMark() {
  return (
    <svg aria-hidden="true" focusable="false" width={22} height={22} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.8} />
      <path d="M12 6.8v4.4l3 2.6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="m15.4 4.6 3.2 3.2" stroke="currentColor" strokeWidth={1.4} opacity={0.55} />
    </svg>
  );
}
