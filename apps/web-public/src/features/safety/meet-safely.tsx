import { raw, tokens } from '@nastech/design-tokens';

/**
 * Where strangers actually meet in this city and why these spots, plus the behaviour rules that
 * matter more than the map. Honest about scope: the platform does not run these venues, is not
 * represented at them, and a CCTV camera protects nobody by itself — it raises the cost of
 * cheating and leaves a record a human can ask for.
 */

export interface MeetingSpot {
  readonly name: string;
  readonly where: string;
  readonly why: string;
}

export const CAPE_TOWN_SPOTS: readonly MeetingSpot[] = [
  {
    name: 'Cape Town Town Police Station — public parking',
    where: 'Buitengracht Street, CBD',
    why: 'SAPS stations generally tolerate exchanges in the well-lit, camera-covered public parking — an officer’s office is not a shop, so keep it to the parking and be quick.',
  },
  {
    name: 'Claremont Police Station parking',
    where: 'Corner of Main Road and Clarence Avenue, Claremont',
    why: 'Southern-suburb midpoint, busy all day, cameras on the parking bays.',
  },
  {
    name: 'V&A Waterfront — Harbourside parking, ground level',
    where: 'Dockside Road; security patrols until late',
    why: 'The default answer in this city for a reason: foot traffic, private security, and a lost-and-found culture. Noisier than you want for inspecting a watch movement, better than you want for not being alone.',
  },
  {
    name: 'Canal Walk Shopping Centre — information desk end of the parking',
    where: '2 Durban Road, Goodwood',
    why: 'Daylight or near it, staffed, cameras everywhere including the entrances.',
  },
  {
    name: 'Somerset West Police Station parking',
    where: 'Olievenhout Avenue, Somerset West',
    why: 'For the eastern peninsula and Stellenbosch crowd; same station-parking logic.',
  },
];

export const OTHER_CITY_SPOTS: readonly MeetingSpot[] = [
  { name: 'Sandton City — security office frontage, Grand Stand parking', where: 'Johannesburg', why: 'Mall security at arm’s length and cameras over every bay.' },
  { name: 'Menlyn Maine — police forum post by the canal deck', where: 'Pretoria', why: 'SAPS metro presence inside the precinct.' },
  { name: 'uMhlanga Rocks Police Station parking', where: 'Durban', why: 'Lighthouse-side, busy, well lit.' },
  { name: 'Baywide Shopping Centre — customer care desk end', where: 'Gqeberha', why: 'The default safe-trade spot most of the city already uses.' },
];

export const MEETING_RULES: readonly string[] = [
  'Daylight, or at least a camera-lit parking lot with people leaving shops. “Quiet shortcut” is the phrase that opens every story on the scam-patterns page.',
  'Go with someone. Not for protection theatre — for a second pair of eyes on the engraving, the papers, and the number plate outside.',
  'The watch, the box and the papers get inspected before the handover PIN is read out, never after. A PIN entered in the app releases the money hold; that moment is the last leverage the buyer has and the first risk the seller takes.',
  'Nobody you both did not book collects anything. A “courier the buyer sent” with a printed airbill is not a handover — see the courier pattern.',
  'Payment lives in the order, not in the parking lot. No EFTs “to clear later”, no cash difference for “the petrol”. If the deal changed after listing, the escrow terms changed too — re-list or re-order, do not improvise.',
  'If the other party is alone in a car and asks you to approach it, you have a choice to make with your shoes on: you can walk.',
];

export function MeetSafely() {
  return (
    <section
      className="safety-meet-safely"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '66ch' }}
    >
      <h2 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay }}>Meeting safely</h2>
      <p style={{ color: tokens.text.secondary }}>
        Every handover here ends with two people and a PIN. This page is about the part the ledger
        cannot see.
      </p>
      <h3 style={{ fontSize: '1.05rem' }}>Spots in the pilot city (Cape Town) people actually use</h3>
      <ul style={{ paddingInlineStart: '1.2rem' }}>
        {CAPE_TOWN_SPOTS.map((spot) => (
          <li key={spot.name} style={{ marginBottom: raw.space.s3 }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{spot.name}</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: tokens.text.secondary }}>{spot.where}</p>
            <p style={{ margin: `${raw.space.s1} 0 0`, fontSize: '0.9rem' }}>{spot.why}</p>
          </li>
        ))}
      </ul>
      <h4 style={{ fontSize: '0.95rem', color: tokens.text.secondary }}>Elsewhere in South Africa</h4>
      <ul style={{ paddingInlineStart: '1.2rem', fontSize: '0.92rem' }}>
        {OTHER_CITY_SPOTS.map((spot) => (
          <li key={spot.name} style={{ marginBottom: raw.space.s2 }}>
            <strong>{spot.name}</strong> ({spot.where}) — {spot.why}
          </li>
        ))}
      </ul>
      <h3 style={{ fontSize: '1.05rem' }}>The rules that outrank any address</h3>
      <ol style={{ paddingInlineStart: '1.2rem' }}>
        {MEETING_RULES.map((rule) => (
          <li key={rule} style={{ marginBottom: raw.space.s3, fontSize: '0.94rem' }}>
            {rule}
          </li>
        ))}
      </ol>
      <p
        style={{
          fontSize: '0.85rem',
          color: tokens.text.secondary,
          background: raw.color.paperWarm,
          padding: raw.space.s3,
          borderRadius: raw.radius.md,
        }}
      >
        What the platform is at these meetings: absent. We do not staff spots, we are not on the
        CCTV feed, and “scheduled at a police station” changes nothing about your escrow or your
        obligations. What we do: the handover PIN, the money hold, and the record you can report
        against afterwards — which is why the PIN is read out last. In real danger, it is 10111;
        afterwards, it is <a href="/safety/report">the report queue</a>.
      </p>
    </section>
  );
}
