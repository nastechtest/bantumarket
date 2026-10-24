import { TIER_LABELS } from '@nastech/api-contracts';
import type { VerificationTier } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * The five tiers, each with what the check was and — mandatory, never omitted — what it was not.
 * Labels come only from TIER_LABELS; a local string that renamed T2 to something warmer would
 * fail the tree scan in no-verified-affordance.test.tsx, and it should.
 */

export const TIER_ORDER: readonly VerificationTier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];

export interface TierClaim {
  readonly tier: VerificationTier;
  /** Always TIER_LABELS[tier] — the constructor below makes anything else a type error at the call site. */
  readonly label: string;
  readonly means: string;
  readonly doesNotMean: string;
  readonly whoChecked: string;
}

function claim(tier: VerificationTier, means: string, doesNotMean: string, whoChecked: string): TierClaim {
  return { tier, label: TIER_LABELS[tier], means, doesNotMean, whoChecked };
}

export const TIER_CLAIMS: readonly TierClaim[] = [
  claim(
    'T1',
    'Everything on the listing is the seller’s own words and photos. Nobody at the platform has seen the item or the person.',
    'Not a platform assessment of anything. Most honest sellers start here; so do most problems.',
    'Nobody — this tier records “nothing has been checked”, which is why it is shown, not hidden.',
  ),
  claim(
    'T2',
    'The onboarding queue matched a photo of an ID document (green book or smart ID) to the profile photo by eye before the account could list.',
    'Not a credit check, not a criminal-record check, and not proof the account holder is the person who will stand in front of you at the handover.',
    'Contract reviewer on the onboarding queue, by eye.',
  ),
  claim(
    'T3',
    'A human read this listing’s text and photos against the prohibited-items and pricing policy before it went live.',
    'They reviewed the listing, not the item. The watch was never in the building. Nothing about the item’s condition or history was assessed.',
    'Listing review queue.',
  ),
  claim(
    'T4',
    'The physical item was in the Cape Town capture studio: it was photographed, handled, and its outer condition compared against the seller’s written disclosures (this is the R270-per-item capture run).',
    'No horologist listened to the movement, opened the caseback, pressure-tested it, or assessed whether the brand made it. A T4 says “we saw this object”, not “this object is what the seller believes it is”.',
    'Capture and QC team — camera and condition, not watchmaking.',
  ),
  claim(
    'T5',
    'For this order, the buyer’s money is held on our side until both sides confirm the handover. It describes where the money is, right now.',
    'It says nothing about the item. Escrow is not a quality judgement and it does not resolve a “not as described” argument for you — that is what the dispute window is for.',
    'The ledger, on order state transitions — a system, not a person.',
  ),
];

export function TierExplainer() {
  return (
    <section
      className="safety-tier-explainer"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ fontFamily: raw.type.familyDisplay, fontSize: '1.5rem', margin: `0 0 ${raw.space.s3}` }}>
        The five tier phrases, and what each one actually records
      </h2>
      <p style={{ color: tokens.text.secondary }}>
        These five phrases are the entire trust vocabulary on this platform. Nothing else you see
        on a listing means a check happened.
      </p>
      <dl style={{ margin: 0 }}>
        {TIER_CLAIMS.map((c) => (
          <div
            key={c.tier}
            data-tier={c.tier}
            style={{
              borderTop: `1px solid ${raw.color.ink100}`,
              padding: `${raw.space.s4} 0`,
            }}
          >
            <dt style={{ fontWeight: 600, fontSize: '1rem' }}>{c.label}</dt>
            <dd style={{ margin: `${raw.space.s2} 0 0` }}>
              <p style={{ margin: 0 }}>{c.means}</p>
              <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
                <strong>What it is not: </strong>
                {c.doesNotMean}
              </p>
              <p style={{ margin: `${raw.space.s2} 0 0`, fontSize: '0.85rem', color: tokens.text.disabled }}>
                Who did it: {c.whoChecked}
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
