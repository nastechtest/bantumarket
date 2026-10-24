/**
 * Tier explainer. The five tier *labels* come verbatim from `TIER_LABELS` — this component cannot
 * render a label that is not in the contract, same rule as the badge. What lives here is the
 * *explanation* of each label: what check the tier stands for and, just as importantly, what it
 * never claims. An explainer that oversells a tier is the §13.2 failure in prose form, so the
 * descriptions below describe the check, not the item, and the top tier is described as a state of
 * money (escrow), not a judgement about the watch.
 */

import type { VerificationTier } from '@nastech/api-contracts';
import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

const TIERS_IN_ORDER: readonly VerificationTier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];

const TIER_MEANING: Readonly<Record<VerificationTier, string>> = {
  T1: 'The seller described the item themselves. Nothing was checked by NasTech.',
  T2: 'The seller’s national ID was matched to the account. That is a person check, not an item check.',
  T3: 'A person at NasTech read this listing against the photos and asked about gaps. We look at words and pictures, not the item itself.',
  T4: 'This item was physically inspected by NasTech before it was listed; the written condition record reflects what was seen then, not forever.',
  T5: 'The buyer’s money is held by NasTech and only moves when both sides confirm the handover. This is about funds, not about the item being genuine.',
};

const NEITHER_NOR = 'No tier means the item is authentic, serviced, water-resistant, or covered by a warranty.';

export interface TierExplainerProps {
  /** When set, the explainer opens on that tier and the row is marked current. */
  readonly currentTier?: VerificationTier;
}

export function TierExplainer({ currentTier }: TierExplainerProps) {
  return (
    <section aria-label="What seller tiers mean" className="item-tier-explainer" style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, fontFamily: raw.type.familyText }}>
      <h4 style={{ margin: 0, fontSize: '0.875rem', color: tokens.text.primary }}>What the labels mean</h4>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${raw.space.s1} ${raw.space.s3}` }}>
        {TIERS_IN_ORDER.map((tier) => (
          <div key={tier} style={{ display: 'contents' }} data-tier-row={tier}>
            <dt style={{ color: tokens.text.primary, fontWeight: currentTier === tier ? 700 : 600 }}>
              {TIER_LABELS[tier]}
              {currentTier === tier ? <span aria-label=" (this seller)"> ◂</span> : null}
            </dt>
            <dd style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>{TIER_MEANING[tier]}</dd>
          </div>
        ))}
      </dl>
      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem', fontStyle: 'italic' }}>{NEITHER_NOR}</p>
    </section>
  );
}
