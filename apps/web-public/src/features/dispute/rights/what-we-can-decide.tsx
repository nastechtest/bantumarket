/**
 * What NasTech can decide, stated as a list of comparisons rather than as a promise of fairness.
 *
 * The point of this panel is that "we will look into it" is not information. A buyer can only judge
 * their own dispute against a described boundary, so each line names the act a reviewer performs —
 * compare this against that — and the money consequence the ledger can actually execute. Anything a
 * reviewer would have to invent an authority for is on the other side, in `./what-we-cannot.tsx`.
 */

import { raw } from '@nastech/design-tokens';
import { Body, Panel, ScopeList } from '../ui.js';

export const WHAT_WE_CAN_DECIDE: readonly string[] = [
  'Whether your photographs and your account contradict the listing photographs and the written description.',
  'Whether a mark you point at is covered by the condition disclosure the seller agreed to before the item was listed.',
  'Whether the item you were handed is the item the listing described — reference, size, and what was said to be included.',
  'Whether the handover happened, when it happened, and what was recorded at it.',
  'Whether a full refund, a partial refund or no action follows from what the records show, and what the ledger does with the commission either way.',
  'Whether to ask you or the seller for one specific thing that would settle a line of the comparison.',
];

export const WHAT_WE_CAN_DECIDE_NOT_A_PROMISE =
  'Deciding means reading the records. It does not mean a workshop, a bench test, or an expert — and it does not carry a date, because no reviewer has committed one to us.';

export function WhatWeCanDecide() {
  return (
    <Panel title="What NasTech can decide" id="dp-can-decide">
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        <Body size="small">
          A reviewer at NasTech compares records. That is the whole of the power this screen has, and it is
          real: the listing, the condition record the seller agreed to, the handover, and what you send now.
        </Body>
        <ScopeList items={WHAT_WE_CAN_DECIDE} variant="can" />
        <Body size="small">{WHAT_WE_CAN_DECIDE_NOT_A_PROMISE}</Body>
      </div>
    </Panel>
  );
}
