/**
 * The sticky buy bar. Buy path is a link into `/checkout/:id` — this page never collects money and
 * never renders a spinner that stands where the buy button will be: with images only, offline
 * transport, no WebGL, the bar is identical.
 *
 * `has3d` appears here as the design-system's fixed marker text ("3D inspected") — a fact about
 * capture alongside the title's register, never a badge and never restyled into a trust mark; the
 * inspect link it unlocks is a navigation, not a seal of approval.
 */

import type { ItemDetail } from '../api/item-transport.js';
import { HAS_3D_MARKER_TEXT, MoneyText, VerificationBadge } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { SaveListingToggle } from './save-listing.js';
import { ShareButton } from './share-button.js';

export interface BuyBarProps {
  readonly detail: ItemDetail;
  readonly checkoutHref: string;
  readonly inspectHref: string | null;
}

/** Commission disclosure for the pilot take rate is the checkout's sentence to say, not this
 * page's; the bar shows the listed price and the seller tier, nothing that rounds to a fee. */

export function BuyBar({ detail, checkoutHref, inspectHref }: BuyBarProps) {
  return (
    <section
      aria-label="Buy"
      className="item-buy-bar"
      data-in-stock={String(detail.inStock)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        padding: raw.space.s4,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.lg,
        background: tokens.surface.primary,
        position: 'sticky',
        top: raw.space.s2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: raw.space.s3, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.75rem', fontFamily: raw.type.familyDisplay, color: tokens.text.primary }}>
          <MoneyText value={detail.price} />
        </span>
        <VerificationBadge tier={detail.seller.tier} />
      </div>
      {detail.inStock ? (
        <a
          href={checkoutHref}
          data-testid="buy-now"
          style={{
            display: 'block',
            textAlign: 'center',
            background: tokens.action.default,
            color: tokens.text.onInverse,
            textDecoration: 'none',
            borderRadius: raw.radius.md,
            padding: `${raw.space.s3} ${raw.space.s4}`,
            fontFamily: raw.type.familyText,
            fontWeight: 600,
          }}
        >
          Buy now — reserve with NasTech escrow
        </a>
      ) : (
        <p data-testid="sold-out" style={{ margin: 0, color: tokens.text.secondary, fontFamily: raw.type.familyText, fontSize: '0.875rem' }}>
          This listing is no longer available. Ask the seller about similar items below.
        </p>
      )}
      {inspectHref !== null ? (
        <a
          href={inspectHref}
          data-marker="has3d"
          style={{
            color: tokens.text.secondary,
            fontSize: '0.8125rem',
            fontFamily: raw.type.familyText,
            textDecoration: 'underline',
          }}
        >
          {HAS_3D_MARKER_TEXT} — turn it yourself on the 3D page
        </a>
      ) : null}
      <div style={{ display: 'flex', gap: raw.space.s2, flexWrap: 'wrap' }}>
        <SaveListingToggle listingId={detail.listingId} />
        <ShareButton detail={detail} />
        <a
          href="#ask-the-seller"
          style={{ color: tokens.action.default, fontSize: '0.8125rem', fontFamily: raw.type.familyText, textDecoration: 'underline', alignSelf: 'center' }}
        >
          Have a question?
        </a>
      </div>
      <p style={{ margin: 0, color: tokens.text.disabled, fontSize: '0.75rem', fontFamily: raw.type.familyText }}>
        Payment is held by NasTech until you both confirm the handover. You never pay a seller
        directly.
      </p>
    </section>
  );
}

/** Href the buy path uses. The controller wires checkout to create-or-resolve the order; listing
 * id in the order slot is the pilot convention (see report). */
export function checkoutHrefFor(listingId: string): string {
  return `/checkout/${encodeURIComponent(listingId)}`;
}

export function inspectHrefFor(listingId: string): string {
  return `/item/${encodeURIComponent(listingId)}/inspect`;
}
