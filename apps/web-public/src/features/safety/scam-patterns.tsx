import { raw, tokens } from '@nastech/design-tokens';

/**
 * The four patterns this market actually eats people with, written from the shape of the complaint,
 * not a security brochure. Each ends in a concrete next move and the report reason it maps to —
 * a nervous person at 11pm should be able to go from "that's happening to me" to a filed report in
 * one page.
 */

export interface ScamPattern {
  readonly id: string;
  readonly headline: string;
  readonly scene: string;
  readonly howItWorks: string;
  readonly tells: readonly string[];
  readonly defence: string;
  readonly reportReasonId: string;
}

export const SCAM_PATTERNS: readonly ScamPattern[] = [
  {
    id: 'overpayment',
    headline: 'The over-payment (a.k.a. the reverse scam)',
    scene:
      'You list a Citizen Eco-Drive at R3,100. A “buyer” pays R3,800 without haggling, then messages in a panic: their “accounting mistake”, please send back the R700 difference to this other number before the full amount “reflects”.',
    howItWorks:
      'The R3,800 was never real, or was real in an account that gets reversed days later — a cancelled debit order, a stolen profile, a bank error “corrected” after you already refunded. Your R700 refund is the only money that actually moves: yours.',
    tells: [
      'Pays above your price without a single question about the watch.',
      'The refund request goes to a different account or number than the one that “paid”.',
      'Urgency dressed as embarrassment — “my boss will see this”.',
    ],
    defence:
      'Touch nothing. An over-payment is not your money until the ledger says the order amount landed, and it never authorises you to send rand anywhere. Say “the difference is handled through the platform, not by me” and report it.',
    reportReasonId: 'overpayment_reverse',
  },
  {
    id: 'fake-proof',
    headline: 'The payment-proof screenshot',
    scene:
      'For a R4,200 Seiko you get a screenshot of a green bank confirmation, then an SMS that looks exactly like your bank’s format. “Funds released on your side — courier is on the way.” Your app shows nothing.',
    howItWorks:
      'Bank-app screens are trivially forged — every phone ships with a camera that photographs another screen. The SMS can be sent from any number, including a spoofed short code. The gap between “proof sent” and “money cleared” is where the watch walks out of your house.',
    tells: [
      'Proof arrives as an image or SMS, never as a deposit you can see in your own bank app.',
      '“Processing for 24 hours, but you can release it now” — processing means not received.',
      'A reference number formatted slightly wrong: FNB style on a Capitec screen, standard bank colours on a random background.',
    ],
    defence:
      'One rule, no exceptions: the item moves when the cleared balance in your own app includes the money — or when the payment sat in the platform’s hold, which the order state shows you. A screenshot weighs nothing. Not one screenshot ever has.',
    reportReasonId: 'payment_proof_mismatch',
  },
  {
    id: 'off-platform',
    headline: 'Getting you off-platform before the handover',
    scene:
      'Third message in, the chat turns: “this app is slow, WhatsApp me”, “data costs money, just call”, “my cousin sells watches, I’ll explain there”. No meeting is booked yet.',
    howItWorks:
      'Once the conversation lives on WhatsApp, the platform’s message log — the strongest evidence the review queue can read by itself — stops existing for this deal. Everything after that (fake proof, changed terms, a “deposit” for a courier) happens where nobody can corroborate you.',
    tells: [
      'The push happens before any handover is scheduled, never after.',
      'Prices or terms “change” in the new channel in ways that would have been reported instantly in the old one.',
      'Number prefix oddities: +234, +237, “my brother’s line”, a WhatsApp profile with the seller’s photos.',
    ],
    defence:
      'Keep it in the app until the handover PIN exists — politely and repeatedly. “I only arrange pickups through here” is a complete sentence. Anyone who refuses after that has told you what they are planning.',
    reportReasonId: 'off_platform_push',
  },
  {
    id: 'fake-courier',
    headline: '“I’m sending a courier” with a printed label',
    scene:
      'A buyer two cities away “accepts” a R5,900 watch, sends a PDF airbill with your name as consignor, a tracking number, and “the courier collects in an hour, just hand the parcel over — payment already done.”',
    howItWorks:
      'The label is typeset in five minutes; any logo is one screenshot away. The “courier” is a person, and the parcel — your watch — is the only real thing in the exchange. Sometimes a real courier company’s name is used precisely because its branding makes the paper look unfakeable at a gate.',
    tells: [
      'A collection arranged by the other party, with you never booking it yourself through the company.',
      'Tracking that “won’t show yet, give it 24 hours” while the van is supposedly already coming.',
      'The handover has no PIN, no platform order, and no meeting you booked.',
    ],
    defence:
      'Never hand an item to someone because their paperwork says they are a courier. Ship only when you booked the collection yourself and payment cleared or sits on platform hold, and only to the address the order shows. On this platform handover means a PIN at a meeting — a stranger at your gate is not a handover.',
    reportReasonId: 'fake_courier',
  },
];

export function ScamPatterns() {
  return (
    <section
      className="safety-scam-patterns"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '66ch' }}
    >
      <h2 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay }}>
        How people get cheated in this market — four patterns
      </h2>
      <p style={{ color: tokens.text.secondary, fontSize: '0.92rem' }}>
        None of these need your password. They need your hurry. If one of them is happening to you
        right now, stop replying and read the defence line of that block first.
      </p>
      {SCAM_PATTERNS.map((pattern) => (
        <article
          key={pattern.id}
          data-pattern={pattern.id}
          style={{
            borderTop: `1px solid ${raw.color.ink100}`,
            paddingBlock: raw.space.s4,
            marginBottom: raw.space.s2,
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{pattern.headline}</h3>
          <p style={{ margin: `${raw.space.s2} 0 0`, fontStyle: 'italic', color: tokens.text.secondary }}>
            {pattern.scene}
          </p>
          <p style={{ margin: `${raw.space.s3} 0 0` }}>
            <strong>Why it works: </strong>
            {pattern.howItWorks}
          </p>
          <p style={{ margin: `${raw.space.s3} 0 0`, fontWeight: 600 }}>The tells</p>
          <ul style={{ margin: `${raw.space.s1} 0 ${raw.space.s3}`, paddingInlineStart: '1.2rem' }}>
            {pattern.tells.map((tell) => (
              <li key={tell} style={{ marginBottom: raw.space.s1, fontSize: '0.92rem' }}>
                {tell}
              </li>
            ))}
          </ul>
          <p style={{ margin: 0 }}>
            <strong>Your defence: </strong>
            {pattern.defence}
          </p>
          <p style={{ margin: `${raw.space.s2} 0 0`, fontSize: '0.88rem' }}>
            It is happening? Stop replying, keep the chat where it is, and{' '}
            <a href="/safety/report">file a report</a> — the reason list has a line for exactly
            this pattern.
          </p>
        </article>
      ))}
      <p style={{ fontSize: '0.88rem', color: tokens.text.secondary }}>
        Out of ideas and out of patience? Economic Crime Lines (SAPS): 08600 10111, option for
        fraud. For a bank-related reversal attempt, phone your bank’s fraud line — the number on
        the back of your card — before you answer anyone else.
      </p>
    </section>
  );
}
