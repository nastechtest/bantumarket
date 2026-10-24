import { motionOk } from '@nastech/motion';
import { raw, tokens } from '@nastech/design-tokens';

const SHIMMER_KEYFRAMES = `@keyframes search-skeleton-shimmer{0%{background-position:120% 0}100%{background-position:-20% 0}}`;

/**
 * Loading placeholders. The shimmer is decorative motion, so `motionOk('decorative')` decides
 * whether the animation exists at all — under prefers-reduced-motion the placeholders are the
 * same boxes with a flat fill, never a spinner or a blank screen. The skeleton's shape mirrors
 * `ListingCard` on purpose: loading should not look like a different page than the one arriving.
 */
export function SkeletonGrid({ count = 6 }: { readonly count?: number }) {
  const animate = motionOk('decorative');
  const slots = Array.from({ length: count }, (_unused, index) => index);

  return (
    <div data-skeleton-grid="" data-shimmer={animate ? 'on' : 'off'} aria-busy="true" aria-label="Loading listings">
      {animate ? <style dangerouslySetInnerHTML={{ __html: SHIMMER_KEYFRAMES }} /> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: raw.space.s4 }}>
        {slots.map((slot) => (
          <div
            key={slot}
            style={{
              border: `1px solid ${raw.color.ink100}`,
              borderRadius: raw.radius.md,
              padding: raw.space.s3,
              display: 'flex',
              flexDirection: 'column',
              gap: raw.space.s2,
              background: tokens.surface.primary,
            }}
          >
            <div
              style={{
                aspectRatio: '1 / 1',
                borderRadius: raw.radius.sm,
                background: animate
                  ? `linear-gradient(100deg, ${raw.color.ink100} 30%, ${tokens.surface.raised} 50%, ${raw.color.ink100} 70%)`
                  : tokens.surface.raised,
                backgroundSize: animate ? '200% 100%' : undefined,
                animation: animate ? 'search-skeleton-shimmer 1.4s linear infinite' : undefined,
              }}
            />
            <div style={{ height: 14, width: '70%', borderRadius: raw.radius.sm, background: tokens.surface.raised }} />
            <div style={{ height: 14, width: '40%', borderRadius: raw.radius.sm, background: tokens.surface.raised }} />
          </div>
        ))}
      </div>
    </div>
  );
}
