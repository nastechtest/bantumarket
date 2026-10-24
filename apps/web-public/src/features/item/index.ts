/**
 * Feature entry. The router lazy-mounts `routes/ItemPage.js`, which re-exports this default —
 * the pattern wave B fixes for every feature directory.
 *
 * This file is `.ts` (the wave contract names it `index.ts`), so the page body is assembled with
 * `createElement` instead of JSX; the JSX lives one level down in `item-page.tsx`.
 *
 * The listing id is read from the live pathname against the route pattern (`/item/:id`), because
 * `RouteDef` carries the *pattern*, not the match; `resolveListingId` is exported for tests.
 * The transport is a module singleton of the fixture implementation: pilot default, zero network,
 * and every flow on this page completes through it. Swapping in `createRemoteItemTransport` is a
 * one-line change at this seam once the HTTP layer exists.
 */

import { createElement, useEffect, useMemo } from 'react';
import type { RouteDef } from '../../router.js';
import { ItemPageView } from './item-page.js';
import { ItemErrorView } from './item-error.js';
import { useItem } from './use-item.js';
import { createFixtureItemTransport } from './api/fixtures.js';
import { raw, tokens } from '@nastech/design-tokens';
import { applyItemSeo } from './seo.js';

export const itemTransport = createFixtureItemTransport();

/** '/item/lst_01' against '/item/:id' → 'lst_01'. Empty string means the pattern did not match —
 * callers show the not-found arm rather than fetching ''. */
export function resolveListingId(pattern: string, pathname: string): string {
  const p = pattern.split('/');
  const a = pathname.split('/');
  if (p.length !== a.length) return '';
  const idx = p.findIndex((seg) => seg.startsWith(':'));
  if (idx === -1) return '';
  const segment = a[idx];
  if (segment === undefined) return '';
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed percent-escape in a hand-typed URL must reach the validation error, not throw
    // out of render and blank the route.
    return '';
  }
}

export function ItemPageSkeleton() {
  // Deliberately shaped like the finished page (photo block, two text blocks): a skeleton that
  // shifts layout when data lands reads as breakage, and this route's whole budget argument is
  // that it renders instantly. No spinner theatre: the wait is one JSON fetch on LTE.
  return createElement(
    'div',
    { 'aria-busy': 'true', className: 'item-skeleton', style: { display: 'grid', gap: raw.space.s5, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' } },
    createElement('div', { style: { aspectRatio: '1 / 1', background: tokens.surface.raised, borderRadius: raw.radius.md } }),
    createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: raw.space.s3, paddingTop: raw.space.s4 } },
      createElement('div', { style: { height: 28, width: '70%', background: tokens.surface.raised, borderRadius: raw.radius.sm } }),
      createElement('div', { style: { height: 16, width: '100%', background: tokens.surface.raised, borderRadius: raw.radius.sm } }),
      createElement('div', { style: { height: 16, width: '85%', background: tokens.surface.raised, borderRadius: raw.radius.sm } }),
    ),
  );
}

export default function ItemFeaturePage({ route }: { route: RouteDef }) {
  const listingId = resolveListingId(route.path, typeof window !== 'undefined' ? window.location.pathname : '');
  const { load, reload } = useItem(itemTransport, listingId === '' ? '__invalid__' : listingId);

  useEffect(() => {
    if (load.status === 'ready') applyItemSeo(load.detail);
  }, [load]);

  const body = useMemo(() => {
    if (listingId === '') return createElement(ItemErrorView, { kind: 'validation', onRetry: reload });
    if (load.status === 'loading') return createElement(ItemPageSkeleton);
    if (load.status === 'failed') return createElement(ItemErrorView, { kind: load.error.kind, onRetry: reload });
    return createElement(ItemPageView, { detail: load.detail, transport: itemTransport, route });
  }, [listingId, load, reload, route]);

  // A `<section>`, not a `<main>`: `layout/app-frame.tsx` owns the document's single main landmark,
  // and a second one here would make skip links and "landmarks only" screen-reader navigation
  // ambiguous on the busiest page in the app.
  return createElement('section', { className: 'item-route' }, body);
}

export { ItemPageView } from './item-page.js';
export { ItemErrorView } from './item-error.js';
export { useItem } from './use-item.js';
