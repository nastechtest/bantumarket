/**
 * Document-head writing for the item page. Hand-rolled because the router here is hand-rolled and
 * a head manager would be a first-paint dependency we are not spending the 170 KB on.
 *
 * Everything pure (`itemSeoFields`) is testable without a DOM; `applyItemSeo` is the only function
 * that touches `document`, and it is a no-op without one (the CI no-3d pre-render pass).
 */

import type { ItemDetail } from './api/item-transport.js';
import { zarDisplay } from './price-format.js';

export interface SeoFields {
  readonly title: string;
  readonly description: string;
  readonly canonicalPath: string;
  readonly ogType: 'product';
  readonly image: string;
}

export function itemSeoFields(detail: ItemDetail): SeoFields {
  const firstRecord = detail.conditionRecords[0];
  const conditionTail = firstRecord !== undefined ? ` Declared: ${clip(firstRecord.text, 90)}.` : '';
  return {
    title: `${detail.title} — ${zarDisplay(detail.price)}, ${detail.seller.city}`,
    // Seller-stated summary plus the first declared fault: a buyer scanning search results on a
    // phone gets the same honest shape as the page itself.
    description: clip(detail.description, 140) + conditionTail,
    canonicalPath: `/item/${encodeURIComponent(detail.listingId)}`,
    ogType: 'product',
    image: detail.poster.url,
  };
}

function clip(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

function upsertMeta(selector: string, attrs: Record<string, string>): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el === null) {
    el = document.createElement('meta');
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    document.head.appendChild(el);
    return;
  }
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
}

export function applyItemSeo(detail: ItemDetail): void {
  if (typeof document === 'undefined') return;
  const fields = itemSeoFields(detail);
  document.title = fields.title;
  upsertMeta('meta[name="description"]', { name: 'description', content: fields.description });
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fields.title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: fields.description });
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: fields.ogType });
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: fields.image });
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });

  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (link === null) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = fields.canonicalPath;
}
