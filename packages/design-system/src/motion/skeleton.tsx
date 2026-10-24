import { useId } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { animationCss, motionOk } from '@nastech/motion';
import { classes, visuallyHidden } from './styles.js';

/**
 * Loading placeholder.
 *
 * Accessibility shape: the visual block is `aria-hidden` (a fake paragraph must never be read)
 * and carries `aria-labelledby` pointing at a visually hidden "Loading" node, so the label is
 * discoverable by assistive technology and by tests without turning the placeholder itself into
 * announced content. The shimmer is `decorative` motion: the class is omitted under reduce and
 * the block renders flat rather than disappearing.
 */
export const motionSkeletonCss = animationCss('skeleton-shimmer');

export interface SkeletonProps {
  /** Any CSS width; defaults to the full line. */
  readonly width?: string;
  readonly height?: string;
  /** Accessible name for the placeholder; defaults to "Loading". */
  readonly label?: string;
  readonly className?: string;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  label = 'Loading',
  className,
}: SkeletonProps) {
  const labelId = useId();
  const animate = motionOk('decorative');

  return (
    <>
      <style data-ds-motion="skeleton-css" dangerouslySetInnerHTML={{ __html: motionSkeletonCss }} />
      <span data-ds-motion="skeleton" aria-labelledby={labelId} style={{ display: 'inline-block', maxWidth: '100%' }}>
        <span id={labelId} style={visuallyHidden}>
          {label}
        </span>
        <span
          aria-hidden="true"
          aria-labelledby={labelId}
          data-ds-skeleton=""
          className={classes('ds-motion-skeleton', animate ? 'motion-skeleton-shimmer' : undefined, className)}
          style={{
            display: 'block',
            width,
            height,
            background: animate
              ? `linear-gradient(90deg, ${tokens.surface.raised} 0%, ${raw.color.ink100} 50%, ${tokens.surface.raised} 100%)`
              : tokens.surface.raised,
            backgroundSize: '200% 100%',
            border: `1px solid ${raw.color.ink100}`,
            borderRadius: raw.radius.sm,
          }}
        />
      </span>
    </>
  );
}
