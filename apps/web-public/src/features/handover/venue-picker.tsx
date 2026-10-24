import { raw, tokens } from '@nastech/design-tokens';
import type { HandoverVenue } from './api/handover-transport.js';

/**
 * Radio group of safe exchange places. The safety note is not decoration: the pilot's whole
 * handover promise is "the app made the honest, safe thing the easy thing", and a venue list
 * without a reason reads like an ad. With no curated venues (empty transport response) the
 * picker degrades to a free-text place rather than a dead screen — a blocked handover is worse
 * than an un-curated one.
 *
 * CONTRACT-GAP: free-text venue is client-only until `/v1/orders/{id}/handover/schedule`
 * accepts `place: string` alongside `venueId`.
 */

export function VenuePicker({
  venues,
  selectedId,
  onSelect,
  freeText,
  onFreeText,
}: {
  venues: readonly HandoverVenue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  freeText: string;
  onFreeText: (value: string) => void;
}) {
  const curated = venues.length > 0;
  return (
    <fieldset
      data-testid="venue-picker"
      style={{ border: 'none', margin: 0, padding: 0, fontFamily: raw.type.familyText }}
    >
      <legend style={{ fontWeight: 600, color: tokens.text.primary, fontSize: '0.9375rem', marginBottom: raw.space.s2 }}>
        Where you’ll meet
      </legend>
      {!curated ? (
        <p style={{ color: tokens.text.secondary, fontSize: '0.875rem' }}>
          No curated places are listed for your area yet — write where you will meet, in a public,
          staffed spot, and both of you will see it on the handover screen.
        </p>
      ) : null}
      {curated
        ? venues.map((venue) => (
            <label
              key={venue.id}
              data-venue={venue.id}
              style={{
                display: 'grid',
                gap: raw.space.s1,
                padding: raw.space.s3,
                marginBottom: raw.space.s2,
                border: `1px solid ${selectedId === venue.id ? tokens.action.default : raw.color.ink100}`,
                borderRadius: raw.radius.md,
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', gap: raw.space.s2, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="venue"
                  value={venue.id}
                  checked={selectedId === venue.id}
                  onChange={() => onSelect(venue.id)}
                />
                <strong style={{ color: tokens.text.primary }}>{venue.name}</strong>
                <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>{venue.area}</span>
              </span>
              <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem', paddingLeft: `calc(${raw.space.s2} + 1.25rem)` }}>
                {venue.safetyNote}
                {venue.staffed ? '' : ' Daylight slots only here.'}
              </span>
            </label>
          ))
        : null}
      {!curated ? (
        <input
          type="text"
          value={freeText}
          onChange={(e) => onFreeText(e.target.value)}
          placeholder="e.g. Sea Point Police Station front desk"
          style={{
            padding: `${raw.space.s2} ${raw.space.s3}`,
            border: `1px solid ${raw.color.ink300}`,
            borderRadius: raw.radius.sm,
            fontFamily: raw.type.familyText,
            fontSize: '1rem',
            color: tokens.text.primary,
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
      ) : null}
    </fieldset>
  );
}
