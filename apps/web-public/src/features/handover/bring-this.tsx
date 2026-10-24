import { raw, tokens } from '@nastech/design-tokens';

/**
 * What each side brings to the exchange. Two lists because the parties need different things,
 * and one shared truth: the PIN must never be sent, typed into, or read from anywhere except
 * this screen, and only in person — the same rule `ConfirmHandover::handle` enforces by
 * deriving the actor from the authenticated principal instead of the request body.
 */

const BUYER_ITEMS = [
  'Your ID — the seller may ask, and you both may need it for a report later.',
  'This phone, open on the handover screen, showing the six-digit code.',
  'The bank card or account you paid with — refunds settle back to where the money came from.',
  'The listing’s written condition list (screenshot it) — the exchange is checked against WORDS, not against a photo or a render.',
];

const SELLER_ITEMS = [
  'Your ID.',
  'This phone, open on the handover screen, showing the six-digit code.',
  'The item exactly as described in the written condition disclosures — anything not in the text is not promised.',
  'Packaging, box or papers you mentioned in the listing, if you mentioned them.',
];

export function BringThis({ role }: { role: 'buyer' | 'seller' }) {
  const items = role === 'buyer' ? BUYER_ITEMS : SELLER_ITEMS;
  return (
    <section data-testid="bring-this" aria-label="What to bring" style={{ fontFamily: raw.type.familyText }}>
      <h3 style={{ margin: `0 0 ${raw.space.s2}`, fontSize: '1rem', color: tokens.text.primary }}>
        Bring this — as {role}
      </h3>
      <ul style={{ margin: 0, paddingLeft: raw.space.s5, display: 'grid', gap: raw.space.s2 }}>
        {items.map((item) => (
          <li key={item} style={{ color: tokens.text.primary, fontSize: '0.9375rem', lineHeight: 1.5 }}>
            {item}
          </li>
        ))}
      </ul>
      <p style={{ margin: `${raw.space.s3} 0 0`, color: raw.color.signalCaution, fontSize: '0.875rem', fontWeight: 600 }}>
        The code was sent to both of you privately, and you each type it into your own screen —
        never into the other person’s phone, never into chat. That is what makes the confirmation
        mean “I was really here”.
      </p>
    </section>
  );
}
