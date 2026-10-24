import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import { REPORT_QUEUE } from '../api/safety-transport.js';

/**
 * The POPIA note that actually applies to a safety feature: why your chats and ID photos are
 * processed, how long a report lives, who sees what, and how to exercise the rights. Written for
 * the safety surfaces specifically — the full processing policy lives elsewhere.
 */

export const POPIA_FACTS: readonly { readonly heading: string; readonly body: string }[] = [
  {
    heading: 'What we process, and under which lawful basis',
    body:
      'POPIA (Protection of Personal Information Act 4 of 2013) requires processing to be necessary and lawful. Account and listing data: necessary for the contract you signed up to (s11(2)(b)) — the sale cannot happen without it. Chat logs on the platform: safety monitoring and evidence for the review queue, on our legitimate interest and that of buyers (s11(2)(g)). The ID-document step behind the tier named below: same ground — not becoming a fencing venue.',
  },
  {
    heading: 'The tier that carries the heaviest document',
    body:
      `The “${TIER_LABELS.T2}” tier exists because a photograph of a green ID book or smart ID was matched to a profile photo. That is the most sensitive item we hold for safety purposes: it is kept only as long as the account is live plus 12 months, encrypted at rest, accessed by the onboarding and fraud queues under named-account audit, and it is never shown to another user. Say its purpose plainly — ${TIER_LABELS.T2} means one person compared two photographs once. It does not mean the platform holds your document in some permanent file with your face on it.`,
  },
  {
    heading: 'What the person you report actually receives',
    body:
      `They see your stated reason, the messages or notes you attached, and the date — because a queue that accuses anonymously cannot be answered fairly. They do not receive your contact details, and we do not hand account data to a complainant. If we are ever compelled by a court order or lawful request, the record of that request stays visible to both sides.`,
  },
  {
    heading: 'Retention',
    body:
      `Report records are kept for ${Math.round(REPORT_QUEUE.retentionMonths / 12)} years — section 14(1) “no longer than necessary” cuts both ways: the queue needs history to match fraud patterns across reopened accounts, and after the window only a legal-hold subset survives. The retention of the ID-document photos themselves is stated in the section above.`,
  },
  {
    heading: 'Your rights, concretely',
    body:
      'Access: request a copy of everything we hold on you (RAI request, free once a year, response within 30 days of a proper request). Correction: wrong ID match, wrong report attached to your account — we correct the record, but a true report about conduct stays. Deletion: safety records cannot be deleted while they are live fraud-pattern evidence; you can object, and a human decides and explains.',
  },
  {
    heading: 'Complaints',
    body:
      'Start with our information officer: privacy@nastech.co.za. If that fails you, the Information Regulator, South Africa — complaints via inforegulator.org.za (PRA is their office). You can go to the Regulator without coming to us first.',
  },
];

export function PopiaNote() {
  return (
    <section
      className="safety-policy-popia"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay }}>
        Your personal information, while we keep you alive to strangers
      </h2>
      <p style={{ color: tokens.text.secondary, fontSize: '0.92rem' }}>
        A safety feature is a pile of personal information wearing a trench coat. Here is the ledger
        of that pile, under POPIA.
      </p>
      {POPIA_FACTS.map((fact) => (
        <div key={fact.heading} style={{ marginBottom: raw.space.s4 }}>
          <h3 style={{ margin: `0 0 ${raw.space.s1}`, fontSize: '1rem' }}>{fact.heading}</h3>
          <p style={{ margin: 0, fontSize: '0.92rem' }}>{fact.body}</p>
        </div>
      ))}
    </section>
  );
}
