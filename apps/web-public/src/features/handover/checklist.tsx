import { raw, tokens } from '@nastech/design-tokens';
import { BringThis } from './bring-this.js';
import { SafetyTips } from './safety-tips.js';

/**
 * The whole pre-exchange brief on one screen: what to bring, where, and how to stay safe.
 * Kept as a composition so the schedule/confirm screens can show it in one place — the moment a
 * party is actually at the venue, they should not have to dig through three screens.
 */

export function Checklist({ role }: { role: 'buyer' | 'seller' }) {
  return (
    <section
      data-testid="checklist"
      aria-label="Before the exchange"
      style={{
        display: 'grid',
        gap: raw.space.s4,
        padding: raw.space.s4,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.lg,
        background: tokens.surface.raised,
      }}
    >
      <BringThis role={role} />
      <SafetyTips />
    </section>
  );
}
