import type { ReactNode } from 'react';
import { raw } from '@nastech/design-tokens';

export type SpaceKey = keyof typeof raw.space;

/**
 * Vertical (or horizontal) rhythm on the token scale and nothing else. The gap is inline-styled
 * rather than class+CSS because a single deterministic value needs no cascade; `data-gap` is
 * there so the DOM stays debuggable on a staff screen.
 */
export function Stack({
  gap = 's3',
  direction = 'vertical',
  align,
  wrap = false,
  children,
}: {
  gap?: SpaceKey;
  direction?: 'vertical' | 'horizontal';
  align?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="ds-stack"
      data-gap={gap}
      style={{
        display: 'flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        gap: raw.space[gap],
        ...(align ? { alignItems: align } : {}),
        ...(wrap ? { flexWrap: 'wrap' as const } : {}),
      }}
    >
      {children}
    </div>
  );
}
