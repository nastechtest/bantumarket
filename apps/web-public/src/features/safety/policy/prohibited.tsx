import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * What may not be listed here, written against South African law and this market's actual failure
 * modes — not a generic marketplace list. Removal is a human decision on a real account, so the
 * consequence column is as specific as the banned column.
 */

export interface ProhibitedEntry {
  readonly what: string;
  readonly because: string;
}

export const PROHIBITED: readonly ProhibitedEntry[] = [
  {
    what: 'Replica or counterfeit watches, and any watch described as “inspired by”, “homage to a reference” or “same as the real one but…” while priced like one',
    because:
      'Selling goods bearing a fake brand mark is a crime in South Africa (Counterfeit Goods Act 37 of 1997), not a style disagreement. Describe a homage watch as a homage and price it as one.',
  },
  {
    what: 'Items with scratched-off, removed or re-engraved serial numbers, and “no papers because it was a gift” lots priced far under market',
    because:
      'The usual shape of stolen property moving through a second-hand market. Dealings in second-hand goods are also regulated — a trader needs the police-issued clearance to trade.',
  },
  {
    what: 'Firearms, ammunition, gun parts and airguns without the licence paperwork shown on the listing; police or SAPS uniform, badges and insignia',
    because:
      'Firearms Control Act 60 of 2000, and impersonating a police member is its own crime. There is no configuration of this market where “meet me at the petrol station” fixes either.',
  },
  {
    what: 'Ivory, rhino horn, abalone (perlemoen) products, protected timber, and any part of a protected species',
    because:
      'NEM: Wildlife Act and the abalone moratorium. These listings attract criminal investigation to buyer as well as seller.',
  },
  {
    what: 'Prescription medicine, unregistered “wellness” products, and veterinary drugs',
    because:
      'Medicines Act 101 of 1965 — selling those is SAHPRA territory. Not a marketplace item, full stop.',
  },
  {
    what: 'Radar jammers, signal blockers and ICASA-unapproved radio gear',
    because: 'Unapproved equipment under the Electronic Communications Act; “everyone on the highway uses one” is not a licence.',
  },
  {
    what: 'Bait prices: “R200 ONO” on a watch that then “needs an R3,000 authentication deposit”',
    because:
      'The deposit-at-the-end is the scam, not the price. Pricing policy says the number in the ad is the number at handover.',
  },
  {
    what: 'Anyone’s ID document, bank card, or handover PIN — including your own, in chat',
    because:
      'It is the raw material of account takeover. A legitimate seller never needs it; a legitimate buyer never sees it before paying through the ledger.',
  },
];

export function ProhibitedPolicy() {
  return (
    <section
      className="safety-policy-prohibited"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay }}>What may not be listed or sold here</h2>
      <p style={{ color: tokens.text.secondary, fontSize: '0.92rem' }}>
        Every listing is read against this page before it goes live. That review is the entire
        content of the “{TIER_LABELS.T3}” tier — a policy read of the text and photos, never a
        judgement on the item itself.
      </p>
      <ul style={{ paddingInlineStart: '1.2rem' }}>
        {PROHIBITED.map((entry) => (
          <li key={entry.what} style={{ marginBottom: raw.space.s4 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{entry.what}</p>
            <p style={{ margin: `${raw.space.s1} 0 0`, fontSize: '0.88rem', color: tokens.text.secondary }}>
              {entry.because}
            </p>
          </li>
        ))}
      </ul>
      <h3 style={{ fontSize: '1.02rem' }}>When a listing breaks this page</h3>
      <p style={{ margin: 0, fontSize: '0.92rem' }}>
        A human decides, on the record of the listing and any chat in the app. The listing comes
        down; the account gets the reason in writing; repeat or serious cases pause the account.
        Where the facts suggest a crime rather than a rule break — counterfeit stock, a firearm, a
        serial-file match to a reported theft — the file goes to SAPS. You can challenge any of it
        through the review queue at <a href="/safety/report">Report</a>.
      </p>
    </section>
  );
}
