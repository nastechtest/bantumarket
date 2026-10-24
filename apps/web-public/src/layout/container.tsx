import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * The content column. `styles.css` already has `.page` (controller-owned); this is the TSX-side
 * equivalent for chrome, built from tokens so the two can never drift visually without the
 * token module being the place that changed.
 */
export function Container({
  children,
  bleed = false,
  testId,
}: {
  readonly children: ReactNode;
  readonly bleed?: boolean;
  readonly testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        maxWidth: bleed ? undefined : tokens.layout.contentMax,
        width: '100%',
        marginInline: 'auto',
        paddingInline: bleed ? 0 : raw.space.s4,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}
