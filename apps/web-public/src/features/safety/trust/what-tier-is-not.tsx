import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import { AFFORDANCE_VOCAB } from '../api/safety-transport.js';

/**
 * The point of this directory, in one page. If a reviewer asks "what exactly does this badge
 * claim?", the answer here is the answer the UI is allowed to give. Spec §13.2 is review-blocking:
 * no glyph, glow, sweep or colour may stand in for a check that did not happen — which is why this
 * component renders plain text on plain borders and nothing decorative near a tier word.
 */

export const NOT_A_TIER_RULES: readonly { readonly rule: string; readonly why: string }[] = [
  {
    rule: 'A tier is a receipt for one process step, not a ranking of people.',
    why:
      'T2 does not make a seller safer than T1. It means an ID photo was looked at once, by a contract reviewer, before listing. Plenty of T1 sellers are careful; some T2 accounts are run by someone else entirely.',
  },
  {
    rule: `No ${AFFORDANCE_VOCAB.checkLabel}, shield, ${AFFORDANCE_VOCAB.tickLabel}, star, ${AFFORDANCE_VOCAB.glowLabel} or green pulse appears next to a tier. Ever.`,
    why:
      'A tick is read as “an expert said yes”. Nobody said yes. The tree-wide test in this directory fails the build when a component renders one, so this is a machine rule, not a style preference.',
  },
  {
    rule: 'Tier words come from one contract file and no one gets to make them warmer.',
    why:
      `“${TIER_LABELS.T1}” reads humble on purpose. A renamed label — something friendlier, something shorter — is a new claim, and new claims get reviewed where the old ones were: in the contracts file.`,
  },
  {
    rule: 'A render of the item is evidence of its shape and outer condition only.',
    why:
      'A rotating watch on screen looks like “serviced, genuine, solid”. The photographs show scratches and proportions. Whether it keeps time, whether the brand made it, whether water gets in — none of that is on screen, and only written disclosures carry it into a dispute.',
  },
  {
    rule: 'Nothing on a listing means the platform vouches for the deal.',
    why:
      'We are the meeting room and the money hold, not a party to the sale and not an underwriter of it. If the handover goes wrong, the record decides — the badge never will, because there is no badge.',
  },
];

export function WhatTierIsNot() {
  return (
    <section
      className="safety-what-tier-is-not"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ fontFamily: raw.type.familyDisplay, fontSize: '1.5rem', margin: `0 0 ${raw.space.s3}` }}>
        What a tier is not
      </h2>
      <p style={{ color: tokens.text.secondary, marginTop: 0 }}>
        Five sentences this page will defend in review, even when they make the interface look less
        impressive.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {NOT_A_TIER_RULES.map((item) => (
          <li
            key={item.rule}
            style={{
              borderLeft: `3px solid ${raw.color.ink100}`,
              padding: `${raw.space.s3} 0 ${raw.space.s3} ${raw.space.s4}`,
              marginBottom: raw.space.s4,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>{item.rule}</p>
            <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>{item.why}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
