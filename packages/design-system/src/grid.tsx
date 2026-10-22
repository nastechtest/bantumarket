import type { ReactNode } from 'react';
import { raw } from '@nastech/design-tokens';

/**
 * One breakpoint system: container queries on the grid itself, not viewport media queries. A
 * listing grid in a half-width staff panel and the same grid full-width on a phone get the same
 * component asking the same question — "how wide am I" — which is the only version that stays
 * true when apps compose layouts differently. Mobile-first: one column until a container says
 * otherwise.
 */
export const gridCss = `
.ds-grid-host{container-type:inline-size;container-name:ds-grid}
.ds-grid{display:grid;grid-template-columns:1fr;gap:${raw.space.s4}}
@container ds-grid (min-width: 30rem){.ds-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container ds-grid (min-width: 48rem){.ds-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@container ds-grid (min-width: 64rem){.ds-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;

export function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="ds-grid-host">
      <div className="ds-grid">{children}</div>
    </div>
  );
}

/**
 * Mount once near the app root. Inline styles cover per-component values; this sheet exists only
 * for what inline styles cannot express — container queries and the tabular-numerals fallback.
 */
export const baseCss = `
.ds-money{font-variant-numeric:tabular-nums}
`;

export function StyleSheet() {
  return <style data-ds-styles dangerouslySetInnerHTML={{ __html: gridCss + baseCss }} />;
}
