import { raw, tokens } from '@nastech/design-tokens';
import { focusRing } from '@nastech/motion';
import { LAYER } from '../overlay/layer.js';

/**
 * The classic failure of a skip link is the one this CSS exists to prevent: hidden with
 * `display:none` (never reachable) or hidden in a way that still hides it *while focused*
 * (keyboard users land on nothing). The resting state is the clipped 4px-box pattern; the
 * `:focus` state restores it to a real button-styled link at the top of the viewport before any
 * other tab stop. Inline styles cannot express `:focus`, so this component ships its own sheet
 * — same precedent as the committed `StyleSheet` — and all metrics come from tokens.
 */
export const skipLinkCss = `
.ds-skip-link{position:fixed;top:${raw.space.s1};left:${raw.space.s1};z-index:${LAYER.sticky}}
.ds-skip-link:not(:focus){clip-path:inset(50%);width:${raw.space.s1};height:${raw.space.s1};overflow:hidden;position:absolute;white-space:nowrap}
.ds-skip-link:focus{background:${tokens.action.default};color:${tokens.text.onInverse};padding:${raw.space.s2} ${raw.space.s4};border-radius:${raw.radius.sm};font-family:${raw.type.familyText};font-size:0.875rem;text-decoration:none;outline:${focusRing.widthPx}px solid ${focusRing.color};outline-offset:${focusRing.offsetPx}px}
`;

export interface SkipLinkProps {
  /** Destination of the app's main content landmark; `#main` is the shell convention. */
  href?: string;
  label?: string;
}

export function SkipLink({ href = '#main', label = 'Skip to main content' }: SkipLinkProps) {
  return (
    <>
      <style data-ds-skip-link dangerouslySetInnerHTML={{ __html: skipLinkCss }} />
      <a className="ds-skip-link" href={href} data-ds-skip-link="">
        {label}
      </a>
    </>
  );
}
