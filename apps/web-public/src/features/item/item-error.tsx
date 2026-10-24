/**
 * Failure surfaces for the item route. `not_found`, `network` and `server` say different things
 * on purpose: "listing gone" tells the buyer to go browse; "we could not reach NasTech" tells
 * them the listing probably exists and a retry is worth a tap; collapsing them into one shrug is
 * how a marketplace page lies about supply.
 */

import type { ItemFailureKind } from './api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';

export interface ItemErrorCopy {
  readonly heading: string;
  readonly body: string;
}

export const ITEM_ERROR_COPY: Readonly<Record<ItemFailureKind, ItemErrorCopy>> = {
  not_found: {
    heading: 'This listing is gone',
    body: 'The seller removed it or it sold. There are other watches on the market page.',
  },
  network: {
    heading: 'We could not reach NasTech',
    body: 'Your connection dropped while loading this listing. Nothing has been bought or changed.',
  },
  server: {
    heading: 'NasTech had a problem loading this',
    body: 'The listing may exist — try again in a moment. If it keeps happening, tell us from any other page.',
  },
  validation: {
    heading: 'This listing link is not valid',
    body: 'The link you followed does not point at a listing we can open. Start from the market search.',
  },
};

export function ItemErrorView({ kind, onRetry }: { kind: ItemFailureKind; onRetry: () => void }) {
  const copy = ITEM_ERROR_COPY[kind];
  return (
    <section
      className="item-error"
      data-error-kind={kind}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        padding: raw.space.s5,
        background: tokens.surface.raised,
        borderRadius: raw.radius.md,
        fontFamily: raw.type.familyText,
      }}
    >
      <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.375rem', color: tokens.text.primary }}>{copy.heading}</h1>
      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.9375rem' }}>{copy.body}</p>
      <div style={{ display: 'flex', gap: raw.space.s3, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onRetry}
          style={{ background: tokens.action.default, color: tokens.text.onInverse, border: 'none', borderRadius: raw.radius.sm, padding: `${raw.space.s2} ${raw.space.s4}`, fontSize: '0.875rem', cursor: 'pointer' }}
        >
          Try again
        </button>
        <a href="/search" style={{ color: tokens.action.default, fontSize: '0.875rem', alignSelf: 'center' }}>
          Browse the market
        </a>
      </div>
    </section>
  );
}
