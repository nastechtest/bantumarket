/**
 * Share, as pure functions over injectable capability objects.
 *
 * Three outcomes, in honesty order: the OS share sheet (`navigator.share`) is 'shared'; writing
 * the link to the clipboard is 'copied'; neither working is 'unsupported' and the UI then shows
 * the link as selectable text rather than pretending a copy happened. A "✓ Shared!" toast on the
 * unsupported path would be exactly the §13.2 failure in a different costume — a check that did
 * not happen rendered as one that did.
 */

import type { ItemDetail } from '../api/item-transport.js';

export type ShareOutcome =
  | { readonly kind: 'shared' }
  | { readonly kind: 'copied' }
  | { readonly kind: 'unsupported' };

/** `| undefined` written out for `exactOptionalPropertyTypes`: callers legitimately pass
 * "no such capability", which must not be a type error. */
export interface ShareCapabilities {
  readonly navigator?: { share?: (data: { title?: string; text?: string; url?: string }) => Promise<unknown> } | undefined;
  readonly clipboard?: { writeText: (text: string) => Promise<unknown> } | undefined;
}

export function buildShareUrl(listingId: string, origin: string = typeof window !== 'undefined' ? window.location.origin : 'https://nastech.market'): string {
  return `${origin.replace(/\/+$/, '')}/item/${encodeURIComponent(listingId)}`;
}

export function shareCaption(detail: ItemDetail, url: string): string {
  // No price inside the caption copy sent to a share sheet: prices move, and a stale screenshot
  // of a share message is how marketplaces get argued about. The link carries the live price.
  return `${detail.title} — used, listed by ${detail.seller.displayName} on NasTech Market: ${url}`;
}

export async function shareListing(detail: ItemDetail, caps: ShareCapabilities = {}, origin?: string): Promise<ShareOutcome> {
  const url = buildShareUrl(detail.listingId, origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://nastech.market'));
  const text = shareCaption(detail, url);
  const nav = caps.navigator;
  if (nav !== undefined && typeof nav.share === 'function') {
    try {
      await nav.share({ title: detail.title, text, url });
      return { kind: 'shared' };
    } catch {
      // AbortError (buyer cancelled the sheet) is not a failure to route around; the caller's
      // outcome for a cancelled sheet is "nothing happened", which is what 'unsupported' means
      // on this page: the platform could not deliver for you, the link is below.
    }
  }
  const clip = caps.clipboard;
  if (clip !== undefined && typeof clip.writeText === 'function') {
    try {
      await clip.writeText(url);
      return { kind: 'copied' };
    } catch {
      return { kind: 'unsupported' };
    }
  }
  return { kind: 'unsupported' };
}
