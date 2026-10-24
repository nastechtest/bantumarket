/**
 * The item page view — the whole product without a single polygon.
 *
 * Order is an argument: photograph (and the twelve frames behind it) → what it says in words →
 * what the pictures *do not* say → who is selling → safety → the questions and the report. The
 * condition record sits above the seller panel on purpose: on a R4,200 used watch, the flaws are
 * the product, and a layout that hides them under a fold of marketing copy would be the static
 * path apologising for itself.
 *
 * `ItemPageView` is pure props-in/markup-out (no fetching, no effects) so no-3d.test.tsx can
 * render the entire page in a static string with the scene runtime deleted from the process —
 * the proof the brief demands. Data loading lives in `use-item.ts` + `index.ts`.
 */

import type { ItemDetail } from './api/item-transport.js';
import type { RouteDef } from '../../router.js';
import { raw, tokens } from '@nastech/design-tokens';
import { Gallery } from './media/gallery.js';
import { ConditionList } from './condition/condition-list.js';
import { WhatThisDoesNotSay } from './condition/what-this-does-not-say.js';
import { SellerPanel } from './seller/seller-panel.js';
import { BuyBar, checkoutHrefFor, inspectHrefFor } from './buy/buy-bar.js';
import { QuestionBox } from './buy/question-box.js';
import { SafetyNote } from './safety/safety-note.js';
import { ReportItem } from './safety/report-item.js';
import { productSchemaScriptProps } from './schema.js';
import type { ItemTransport } from './api/item-transport.js';

export interface ItemPageViewProps {
  readonly detail: ItemDetail;
  readonly transport: Pick<ItemTransport, 'askQuestion' | 'reportListing'>;
  /** Empty (default) derives from window.location.origin; tests pass a fixed base. */
  readonly canonicalBase?: string;
  readonly route?: RouteDef;
}

export function resolveCanonicalBase(explicit: string | undefined): string {
  if (explicit !== undefined && explicit !== '') return explicit;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function ItemPageView({ detail, transport, canonicalBase, route }: ItemPageViewProps) {
  const buy = checkoutHrefFor(detail.listingId);
  const inspect = detail.has3d ? inspectHrefFor(detail.listingId) : null;
  const schemaBase = resolveCanonicalBase(canonicalBase);

  return (
    <article className="item-page" data-listing={detail.listingId} style={{ fontFamily: raw.type.familyText, color: tokens.text.primary }}>
      {schemaBase !== '' ? <script {...productSchemaScriptProps(detail, schemaBase)} /> : null}
      <header
        style={{
          display: 'grid',
          gap: raw.space.s5,
          gridTemplateColumns: 'minmax(0, 1fr)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: raw.space.s5, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          <Gallery detail={detail} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s4 }}>
            <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: 'clamp(1.375rem, 3.2vw, 1.75rem)', lineHeight: 1.25 }}>
              {detail.title}
            </h1>
            <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.9375rem', lineHeight: 1.55 }}>{detail.description}</p>
            <BuyBar detail={detail} checkoutHref={buy} inspectHref={inspect} />
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gap: raw.space.s5, marginTop: raw.space.s6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s4 }}>
          <ConditionList records={detail.conditionRecords} />
          <WhatThisDoesNotSay scope={detail.claimScope} hasRender={detail.turntable !== null || detail.has3d} />
          <SellerPanel seller={detail.seller} />
          <QuestionBox sellerName={detail.seller.displayName} onAsk={(q) => transport.askQuestion(detail.listingId, q)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s4 }}>
          <SafetyNote />
          <ReportItem onReport={(reason) => transport.reportListing(detail.listingId, reason)} />
          {route !== undefined ? (
            <p style={{ margin: 0, color: tokens.text.disabled, fontSize: '0.75rem' }}>Route class: {route.class}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
