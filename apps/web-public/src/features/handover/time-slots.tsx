import { raw, tokens } from '@nastech/design-tokens';
import type { HandoverSlot } from './api/handover-transport.js';
import { formatSast, parseServerInstant } from '../../lib/window-validity.js';

/**
 * Bookable slots, labelled SAST explicitly — the label carries its own zone because a bare
 * "14:00" on a device set to another zone is how a buyer arrives two hours late. Slots whose
 * END has already passed on the server clock are not offerable; the comparison is against the
 * server's `nowMs` passed in, never `Date.now()` at render.
 */

export function TimeSlots({
  slots,
  serverNowMs,
  selectedId,
  onSelect,
}: {
  slots: readonly HandoverSlot[];
  serverNowMs: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset data-testid="time-slots" style={{ border: 'none', margin: 0, padding: 0, fontFamily: raw.type.familyText }}>
      <legend style={{ fontWeight: 600, color: tokens.text.primary, fontSize: '0.9375rem', marginBottom: raw.space.s2 }}>
        When — all times are SAST (UTC+2)
      </legend>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: raw.space.s2 }}>
        {slots.map((slot) => {
          const start = formatSast(parseServerInstant(slot.startIso));
          const end = formatSast(parseServerInstant(slot.endIso));
          const past = parseServerInstant(slot.endIso) <= serverNowMs;
          return (
            <li key={slot.id}>
              <label
                data-slot={slot.id}
                data-past={past ? 'true' : 'false'}
                style={{
                  display: 'flex',
                  gap: raw.space.s2,
                  alignItems: 'center',
                  padding: raw.space.s3,
                  border: `1px solid ${selectedId === slot.id && !past ? tokens.action.default : raw.color.ink100}`,
                  borderRadius: raw.radius.md,
                  cursor: past ? 'not-allowed' : 'pointer',
                  opacity: past ? 0.5 : 1,
                }}
              >
                <input type="radio" name="slot" value={slot.id} disabled={past} checked={selectedId === slot.id} onChange={() => onSelect(slot.id)} />
                <span style={{ color: tokens.text.primary }}>
                  {start.label.replace(' SAST', '')} – {end.time} SAST
                </span>
                {past ? <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>passed</span> : null}
              </label>
            </li>
          );
        })}
        {slots.length === 0 ? (
          <li style={{ color: tokens.text.secondary }}>No open slots from the server right now — check again shortly.</li>
        ) : null}
      </ul>
    </fieldset>
  );
}
