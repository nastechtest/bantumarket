/**
 * JSON-LD for the item page: schema.org `Product` + `Offer`.
 *
 * Two constraints worth the comment:
 *  - the price is `zarMajorMinor` (integer arithmetic), never `(cents/100).toFixed(2)`;
 *  - `itemCondition` is `UsedCondition` for every pilot listing because the capture programme is
 *    pre-owned watches; a listing that was not used would need the field added to the DTO first,
 *    not a guess here.
 * No "verified" vocabulary appears anywhere in the output, and the seller is named as the seller
 * (an `Organization` of one person's public display name) — the platform is not a claimant.
 */

import type { ItemDetail } from './api/item-transport.js';
import { zarMajorMinor } from './price-format.js';

export interface ProductSchema {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Product';
  readonly name: string;
  readonly description: string;
  readonly image: readonly string[];
  readonly sku: string;
  readonly condition: 'UsedCondition';
  readonly offers: {
    readonly '@type': 'Offer';
    readonly url: string;
    readonly price: string;
    readonly priceCurrency: 'ZAR';
    readonly availability: 'https://schema.org/InStock' | 'https://schema.org/OutOfStock';
    readonly itemCondition: 'https://schema.org/UsedCondition';
    readonly seller: { readonly '@type': 'Organization'; readonly name: string };
    readonly validFrom: string;
  };
}

export function itemCanonicalUrl(canonicalBase: string, listingId: string): string {
  return `${canonicalBase.replace(/\/+$/, '')}/item/${encodeURIComponent(listingId)}`;
}

export function buildProductSchema(detail: ItemDetail, canonicalBase: string): ProductSchema {
  const images = [detail.poster.url, ...detail.stills.map((s) => s.url)];
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: detail.title,
    description: detail.description,
    image: images,
    sku: detail.listingId,
    condition: 'UsedCondition',
    offers: {
      '@type': 'Offer',
      url: itemCanonicalUrl(canonicalBase, detail.listingId),
      price: zarMajorMinor(detail.price),
      priceCurrency: 'ZAR',
      availability: detail.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: detail.seller.displayName },
      validFrom: detail.listedAt,
    },
  };
}

/**
 * Props for the `<script type="application/ld+json">` block. JSON.stringify is safe here: the
 * object is built from contract types, not from response bodies, and `</script>` inside a string
 * is escaped to `<\/script>` so the markup cannot break out of the tag.
 */
export function productSchemaScriptProps(detail: ItemDetail, canonicalBase: string): {
  type: 'application/ld+json';
  dangerouslySetInnerHTML: { __html: string };
} {
  const json = JSON.stringify(buildProductSchema(detail, canonicalBase)).replaceAll('</', '<\\/');
  return { type: 'application/ld+json', dangerouslySetInnerHTML: { __html: json } };
}
