import { raw, tokens } from '@nastech/design-tokens';
import { animationCss, focusRing, motionOk } from '@nastech/motion';
import { classes, visuallyHidden } from './styles.js';

/**
 * The one loading indicator allowed to loop. It is a live region (`role="status"`,
 * `aria-live="polite"`) from first paint, so the announcement exists before the spin and does
 * not depend on motion. Under reduce the ring stays visible and static — the indicator is
 * information, only the rotation is decoration.
 */
export const motionSpinnerCss = animationCss('spinner');

export interface SpinnerProps {
  /** Announced text; defaults to "Loading". */
  readonly label?: string;
  /** Any CSS length; defaults to the 24px step on the space scale. */
  readonly size?: string;
  readonly className?: string;
}

export function Spinner({ label = 'Loading', size = raw.space.s5, className }: SpinnerProps) {
  const animate = motionOk('decorative');

  return (
    <>
      <style data-ds-motion="spinner-css" dangerouslySetInnerHTML={{ __html: motionSpinnerCss }} />
      <span
        role="status"
        aria-live="polite"
        data-ds-motion="spinner"
        className={classes('ds-motion-spinner', className)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: raw.space.s2 }}
      >
        <span
          aria-hidden="true"
          className={animate ? 'motion-spinner' : undefined}
          style={{
            display: 'inline-block',
            width: size,
            height: size,
            border: `${focusRing.widthPx}px solid ${raw.color.ink100}`,
            borderTopColor: tokens.action.default,
            borderRadius: raw.radius.pill,
            boxSizing: 'border-box',
          }}
        />
        <span style={visuallyHidden}>{label}</span>
      </span>
    </>
  );
}
