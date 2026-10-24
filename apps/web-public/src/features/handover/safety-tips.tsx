import { raw, tokens } from '@nastech/design-tokens';

/**
 * Safety guidance, written for the moment it is read: two strangers, a valuable watch, a public
 * place. Deliberately short — nobody reads a wall of text at a meeting point — and deliberately
 * free of anything that implies the app is supervising: these are the party's choices, the app
 * just refuses to leave them un-said.
 */

const TIPS = [
  { title: 'Meet where it is public and lit', body: 'A police station forecourt, a mall entrance or a staffed info desk. Not a parking deck, not a quiet street, not “just round the corner”.' },
  { title: 'Bring nothing to prove but what is in the text', body: 'The listing’s written condition disclosures are the agreed record of the item. If it matches the words, it matches.' },
  { title: 'Keep the app open during the exchange', body: 'The window timer and both codes live on this screen. If the other side will not confirm in the app, that is information — use “They haven’t arrived”.' },
  { title: 'Cash is the one thing not to introduce', body: 'The buyer already paid and the money is held. Anyone asking to settle “in cash instead” is describing a refund you will not get.' },
  { title: 'If it feels wrong, stop', body: 'A window that expires is recoverable; a handover gone wrong may not be. Reissue costs nothing.' },
];

export function SafetyTips() {
  return (
    <section data-testid="safety-tips" aria-label="Safety at the meet-up" style={{ fontFamily: raw.type.familyText }}>
      <h3 style={{ margin: `0 0 ${raw.space.s2}`, fontSize: '1rem', color: tokens.text.primary }}>Safety at the meet-up</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: raw.space.s3 }}>
        {TIPS.map((tip) => (
          <li key={tip.title}>
            <p style={{ margin: 0, fontWeight: 600, color: tokens.text.primary, fontSize: '0.9375rem' }}>{tip.title}</p>
            <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem', lineHeight: 1.5 }}>{tip.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
