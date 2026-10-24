import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * The front door of the safety feature. Written to be read by a nervous person at 11pm on a phone:
 * no account needed, no JS needed to understand it, and the answer to the question they are really
 * asking — "is the person I am about to meet cheating me?" — reachable in one tap.
 */

export const HUB_SECTIONS: readonly { readonly path: string; readonly title: string; readonly blurb: string }[] = [
  {
    path: '/safety/how-it-works',
    title: 'How a sale works here',
    blurb: 'Every state the money and the watch pass through, and the short list of things no state includes.',
  },
  {
    path: '/safety/meet-safely',
    title: 'Meeting safely',
    blurb: 'Camera-lit spots in Cape Town and elsewhere, and six rules that outrank any address.',
  },
  {
    path: '/safety/scam-patterns',
    title: 'Four ways people get cheated here',
    blurb: 'Over-payment, fake payment proof, the move to WhatsApp, the printed courier label. Scenes, tells, defences.',
  },
  {
    path: '/safety/report',
    title: 'Report a listing, seller, order or handover',
    blurb: 'A human reads it. The queue has a response target, not a promise — and the person you report can see it.',
  },
  {
    path: '/safety/trust',
    title: 'The five tier phrases',
    blurb: 'What each one records, who did the check, and what it refuses to imply.',
  },
  {
    path: '/safety/blocking',
    title: 'Sellers you have muted',
    blurb: 'Real suppression on your side of the platform — hidden listings, refused messages — with the list to undo it.',
  },
  {
    path: '/safety/policy/fees',
    title: 'Fees',
    blurb: 'What the 10 % is charged at, and the section explaining what it does not buy.',
  },
  {
    path: '/safety/policy/prohibited',
    title: 'What may not be listed',
    blurb: 'The banned list, with the South African law behind each line and the consequences spelled out.',
  },
  {
    path: '/safety/policy/popia',
    title: 'Your personal information',
    blurb: 'POPIA, in the amount of detail a safety feature deserves — what we keep, who sees your report, for how long.',
  },
  {
    path: '/safety/policy/children',
    title: 'Children on the platform',
    blurb: 'The 18 floor, why it is law and not caution, and what to do when you find a contradiction.',
  },
];

export function SafetyHub() {
  return (
    <main
      className="safety-hub"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '66ch' }}
    >
      <h1 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.8rem' }}>
        Safety, trust and reporting
      </h1>
      <p style={{ fontSize: '1.02rem' }}>
        Strangers are about to hand each other a watch and money in a parking lot. Here is exactly
        what this platform does about that — and, on every page below, exactly what it does not.
      </p>
      <p
        style={{
          padding: raw.space.s3,
          background: raw.color.paperWarm,
          borderRadius: raw.radius.md,
          fontSize: '0.9rem',
        }}
      >
        The entire trust vocabulary, in one line:{" "}
        <strong>
          {TIER_LABELS.T1} · {TIER_LABELS.T2} · {TIER_LABELS.T3} · {TIER_LABELS.T4} ·{' '}
          {TIER_LABELS.T5}
        </strong>
          . Five phrases, five process steps, no stars, no badges, no glow — read the trust page for
          what each refuses to claim.
      </p>
      <nav aria-label="Safety sections">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {HUB_SECTIONS.map((section) => (
            <li key={section.path} style={{ borderBottom: `1px solid ${raw.color.ink100}` }}>
              <a
                href={section.path}
                style={{
                  display: 'block',
                  padding: `${raw.space.s3} ${raw.space.s2}`,
                  color: tokens.text.primary,
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontWeight: 600 }}>{section.title}</span>
                <span style={{ display: 'block', fontSize: '0.88rem', color: tokens.text.secondary, marginTop: raw.space.s1 }}>
                  {section.blurb}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p style={{ fontSize: '0.85rem', color: tokens.text.secondary }}>
        In immediate danger: <strong>10111</strong> (SAPS) — this site is not an emergency line and
        no queue here is faster than one.
      </p>
    </main>
  );
}
