import { ListingCard } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { CONDITION_LABELS, categoryLabel, locationLabel } from '../types.js';
import type { SearchListing } from '../types.js';

/**
 * One search result. The card body is the design-system `ListingCard` — poster, tier badge,
 * capture marker, title, price — so the parity rule "no layout weight favours 3D listings"
 * holds by construction: `has3d` never reaches this file's styling, only the marker text inside
 * ListingCard, which is a stated fact in secondary colour with no glow, badge, or size change
 * (spec §13.2). The meta row below uses fields the wire contract does not carry yet
 * (CONTRACT-GAP: condition/location/postedAt, see types.ts) and hides itself per-field rather
 * than rendering a placeholder box.
 */
export function ResultCard({ listing }: { readonly listing: SearchListing }) {
  const meta: string[] = [];
  if (listing.condition !== undefined) meta.push(CONDITION_LABELS[listing.condition]);
  if (listing.locationSlug !== undefined) meta.push(locationLabel(listing.locationSlug));
  meta.push(categoryLabel(listing.categorySlug));

  return (
    <a
      href={`/item/${listing.id}`}
      data-listing-id={listing.id}
      className="search-result"
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <ListingCard listing={listing} />
      <div
        style={{
          display: 'flex',
          gap: raw.space.s2,
          flexWrap: 'wrap',
          padding: `${raw.space.s1} ${raw.space.s3} 0`,
          fontSize: '0.8125rem',
          color: tokens.text.secondary,
          fontFamily: raw.type.familyText,
        }}
      >
        {meta.map((piece) => (
          <span key={piece}>{piece}</span>
        ))}
      </div>
    </a>
  );
}
