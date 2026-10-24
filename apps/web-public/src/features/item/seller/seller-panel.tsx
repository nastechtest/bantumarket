/**
 * Seller panel: who you are dealing with, in contract vocabulary only. The tier goes through
 * `VerificationBadge` (which refuses anything TIER_LABELS does not contain); the response time is
 * a measured statistic or an explicit "no history"; there is no star rating, because a rating is a
 * claim we have no check behind it.
 */

import { useState } from 'react';
import type { SellerInfo } from '../api/item-transport.js';
import { VerificationBadge } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { ResponseTime } from './response-time.js';
import { TierExplainer } from './tier-explainer.js';

export function memberSinceYear(iso: string): string {
  const year = iso.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

export function SellerPanel({ seller }: { seller: SellerInfo }) {
  const [showExplainer, setShowExplainer] = useState(false);
  const year = memberSinceYear(seller.memberSince);
  return (
    <section
      aria-label="About the seller"
      className="item-seller"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        padding: raw.space.s4,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        background: tokens.surface.primary,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: raw.space.s3, flexWrap: 'wrap' }}>
        <span
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: raw.radius.pill,
            background: tokens.surface.raised,
            border: `1px solid ${raw.color.ink100}`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: raw.type.familyDisplay,
            color: tokens.text.primary,
          }}
        >
          {seller.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
          <strong style={{ fontFamily: raw.type.familyText, color: tokens.text.primary }}>{seller.displayName}</strong>
          <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
            {seller.city}
            {year !== '' ? ` · on NasTech since ${year}` : ''}
          </span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <VerificationBadge tier={seller.tier} />
        </div>
      </div>
      <ResponseTime hours={seller.typicalResponseHours} />
      <button
        type="button"
        onClick={() => setShowExplainer((s) => !s)}
        aria-expanded={showExplainer}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: 'none',
          color: tokens.action.default,
          fontSize: '0.8125rem',
          fontFamily: raw.type.familyText,
          cursor: 'pointer',
          padding: 0,
          textDecoration: 'underline',
        }}
      >
        {showExplainer ? 'Hide what these labels mean' : 'What do these labels mean?'}
      </button>
      {showExplainer ? <TierExplainer currentTier={seller.tier} /> : null}
    </section>
  );
}
