import { raw, tokens } from '@nastech/design-tokens';
import { motionOk } from '@nastech/motion';

/**
 * A skeleton is a placeholder for content that will arrive, so it is `aria-hidden` — a reader
 * must never walk a fake paragraph. The pulsing is `decorative` motion: under reduced motion the
 * class is not applied and the block sits static. The placeholder itself never disappears on
 * motion grounds; it disappears when the real content mounts (see LoadingRow's `aria-busy`).
 */
export const skeletonCss = `
@keyframes ds-skeleton-pulse{0%{opacity:1}50%{opacity:0.55}100%{opacity:1}}
.ds-skeleton--pulse{animation:ds-skeleton-pulse 1200ms linear infinite}
`;

export interface SkeletonProps {
  /** Any CSS width string; defaults to the full cell. */
  width?: string;
  height?: string;
  label?: string;
}

export function Skeleton({ width = '100%', height = '1rem', label }: SkeletonProps) {
  const animate = motionOk('decorative');
  return (
    <>
      <style data-ds-skeleton dangerouslySetInnerHTML={{ __html: skeletonCss }} />
      <span
        aria-hidden="true"
        data-ds-skeleton=""
        {...(label ? { 'data-label': label } : {})}
        className={animate ? 'ds-skeleton ds-skeleton--pulse' : 'ds-skeleton'}
        style={{
          display: 'inline-block',
          width,
          height,
          background: tokens.surface.raised,
          border: `1px solid ${raw.color.ink100}`,
          borderRadius: raw.radius.sm,
        }}
      />
    </>
  );
}
