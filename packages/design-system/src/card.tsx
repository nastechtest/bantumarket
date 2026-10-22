import type { ListingSummary } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import { VerificationBadge } from './badge.js';
import { MoneyText } from './money.js';

/**
 * Wording is fixed by the brief: the capture marker states the fact ("3D inspected") in the same
 * register as the title. It is never a badge — badges carry the tier vocabulary — and it gets no
 * glow, animation or assurance colour, because a capture is not a check that could verify
 * anything (spec §13.2).
 */
export const HAS_3D_MARKER_TEXT = '3D inspected';

export function ListingCard({ listing }: { listing: ListingSummary }) {
  return (
    <article
      className="ds-card"
      style={{
        background: tokens.surface.primary,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s2,
        padding: raw.space.s3,
      }}
    >
      <div
        className="ds-card__poster"
        data-poster-slot=""
        style={{ aspectRatio: '1 / 1', background: tokens.surface.raised, borderRadius: raw.radius.sm }}
      >
        {listing.posterUrl ? (
          <img
            src={listing.posterUrl}
            alt={listing.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: raw.space.s2, flexWrap: 'wrap' }}>
        <VerificationBadge tier={listing.sellerTier} />
        {listing.has3d ? (
          <span
            className="ds-card__capture"
            data-marker="has3d"
            style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}
          >
            {HAS_3D_MARKER_TEXT}
          </span>
        ) : null}
      </div>
      <h3
        style={{
          margin: 0,
          fontFamily: raw.type.familyDisplay,
          fontSize: '1.0625rem',
          color: tokens.text.primary,
        }}
      >
        {listing.title}
      </h3>
      <div style={{ color: tokens.text.primary }}>
        <MoneyText value={listing.price} />
      </div>
    </article>
  );
}
