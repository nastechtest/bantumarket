/**
 * Safety note, on the listing page rather than only in the handover flow, because the decision of
 * *where to meet* is made here, weeks earlier. Copy is instructions, not reassurance: it never
 * promises NasTech presence at a handover (we are not there), and it pairs with the real policy
 * links from design-system so the compliance surfaces (POPIA / CPA) are present on this page as
 * the policy reviewers require.
 */

import { Disclosure, PolicyLinks } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';

export function SafetyNote() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3 }}>
      <Disclosure tone="policy" title="Meeting safely">
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
          <li>Meet in a public place — a police station parking area or a mall entrance is normal here and sellers expect it.</li>
          <li>Never pay the seller directly. Payment goes through NasTech and is released only when both sides confirm the handover.</li>
          <li>Keep the negotiation inside NasTech messages; chats elsewhere cannot be read as evidence in a dispute.</li>
          <li>Before you part, check the handover slip in the app shows this item, this price, and the same serial or distinguishing marks you agreed on.</li>
        </ul>
      </Disclosure>
      <p style={{ margin: 0, color: tokens.text.disabled, fontSize: '0.75rem', fontFamily: raw.type.familyText }}>
        NasTech staff do not attend handovers. Safety at the meeting is yours and the seller’s
        choice of place and time.
      </p>
      <PolicyLinks />
    </div>
  );
}
