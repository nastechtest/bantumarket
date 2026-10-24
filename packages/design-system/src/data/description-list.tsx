import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export interface DescriptionItem {
  readonly term: string;
  readonly detail: ReactNode;
}

/**
 * Item spec sheets ("Movement: automatic; Case: 40mm") are term/detail pairs, and `dl/dt/dd` is
 * the one markup a reader can announce as a pairing rather than a run of unrelated text. The
 * flex layout places dt/dd side by side on wide surfaces and stacks them naturally when they
 * wrap — semantics do not depend on the visual arrangement.
 */
export function DescriptionList({ items, label }: { items: readonly DescriptionItem[]; label?: string }) {
  return (
    <dl
      className="ds-description-list"
      {...(label ? { 'aria-label': label } : {})}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: `${raw.space.s2} ${raw.space.s5}`,
        margin: 0,
        fontFamily: raw.type.familyText,
        fontSize: '0.875rem',
      }}
    >
      {items.map((item) => (
        <div key={item.term} className="ds-description-list__pair" style={{ display: 'flex', gap: raw.space.s2, minWidth: '16rem' }}>
          <dt style={{ margin: 0, color: tokens.text.secondary, fontWeight: 600 }}>{item.term}</dt>
          <dd style={{ margin: 0, color: tokens.text.primary }}>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
