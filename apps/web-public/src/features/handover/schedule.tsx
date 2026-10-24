import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { HandoverSlot, HandoverTransport, HandoverVenue, ScheduleResult } from './api/handover-transport.js';
import { VenuePicker } from './venue-picker.js';
import { TimeSlots } from './time-slots.js';
import { parseServerInstant } from '../../lib/window-validity.js';

/**
 * Booking the exchange. Scheduling is the state change `PAID → HANDOVER_SCHEDULED`
 * (`ScheduleHandover` refuses it on any unpaid order — that refusal is the structural answer
 * to "the PIN can never mark an order paid"), so the screen states that plainly and then does
 * one job well: pick a public place, pick a server-offered slot, and reveal the freshly issued
 * code exactly once.
 */

export interface ScheduleProps {
  readonly transport: HandoverTransport;
  readonly orderId: string;
  /** Order state gates the CTA copy; anything past PAID is reschedule/reissue, not schedule. */
  readonly orderPaid: boolean;
  readonly onScheduled: (result: ScheduleResult) => void;
}

export function Schedule({ transport, orderId, orderPaid, onScheduled }: ScheduleProps) {
  const [venues, setVenues] = useState<readonly HandoverVenue[]>([]);
  const [slots, setSlots] = useState<readonly HandoverSlot[]>([]);
  const [serverNowMs, setServerNowMs] = useState<number>(0);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [freeTextVenue, setFreeTextVenue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ScheduleResult | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([transport.listVenues(), transport.listSlots(orderId)]).then(([v, offer]) => {
      if (!alive) return;
      setVenues(v);
      setSlots(offer.slots);
      setServerNowMs(parseServerInstant(offer.serverNowIso));
      if (v.length > 0) setVenueId(v[0]!.id);
    });
    return () => {
      alive = false;
    };
  }, [transport, orderId]);

  const ready = useMemo(() => orderPaid && slotId !== null && (venues.length === 0 ? freeTextVenue.trim().length > 0 : venueId !== null), [orderPaid, slotId, venues.length, venueId, freeTextVenue]);

  if (revealed !== null) {
    return (
      <PinReveal result={revealed} onDone={() => onScheduled(revealed)} />
    );
  }

  return (
    <section data-testid="schedule" aria-label="Arrange the handover" style={{ display: 'grid', gap: raw.space.s4 }}>
      <p style={line}>
        {orderPaid
          ? 'The buyer’s money is held by NasTech. Choose where and when you will meet; this arranges the exchange and issues a fresh six-digit code to each of you.'
          : 'A handover can only be arranged once payment is recorded by the provider. This screen will open then — nothing about meeting earlier changes that.'}
      </p>
      <VenuePicker
        venues={venues}
        selectedId={venueId}
        onSelect={setVenueId}
        freeText={freeTextVenue}
        onFreeText={setFreeTextVenue}
      />
      <TimeSlots slots={slots} serverNowMs={serverNowMs} selectedId={slotId} onSelect={setSlotId} />
      <div>
        <button
          data-testid="schedule-submit"
          type="button"
          disabled={!ready || busy}
          style={cta(!ready || busy)}
          onClick={() => {
            if (!ready || busy) return;
            setBusy(true);
            setError(null);
            transport
              .scheduleHandover(orderId, { venueId: venues.length === 0 ? `free:${freeTextVenue.trim()}` : (venueId ?? ''), slotId: slotId ?? '' })
              .then(setRevealed)
              .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not book that slot.'))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Booking…' : 'Book this place and time'}
        </button>
      </div>
      {error !== null ? <p role="alert" style={{ ...line, color: raw.color.signalNegative }}>{error}</p> : null}
    </section>
  );
}

/**
 * The PIN exists in this response only (`ScheduledHandover` is returned once, plaintext, and is
 * stored as a keyed hash). The reveal screen is therefore a one-way door: "shown" is recorded,
 * and there is no back-navigation that could re-display it — losing it means reissue.
 */
export function PinReveal({ result, onDone }: { result: ScheduleResult; onDone: () => void }) {
  return (
    <section
      data-testid="pin-reveal"
      role="dialog"
      aria-label="Your handover code"
      style={{ display: 'grid', gap: raw.space.s3, padding: raw.space.s5, border: `2px solid ${tokens.action.default}`, borderRadius: raw.radius.lg }}
    >
      <h2 style={{ margin: 0, fontFamily: raw.type.familyText, fontSize: '1.0625rem', color: tokens.text.primary }}>
        Your handover code — shown once
      </h2>
      <p
        data-testid="pin-digits"
        style={{
          margin: 0,
          fontFamily: raw.type.familyMono,
          fontSize: '2.5rem',
          letterSpacing: '0.25em',
          color: tokens.text.primary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {result.pin}
      </p>
      <p style={line}>
        The same code went to the other party privately, and there is no screen anywhere that
        reads it back. If you lose this, reissue a new one — it costs nothing and replaces this code.
      </p>
      <button type="button" onClick={onDone} style={cta(false)}>
        Got it — I’ll keep this code on this phone
      </button>
    </section>
  );
}

const line: CSSProperties = { margin: 0, fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary, lineHeight: 1.5 };
const cta = (disabled: boolean): CSSProperties => ({
  padding: `${raw.space.s3} ${raw.space.s5}`,
  borderRadius: raw.radius.sm,
  border: 'none',
  background: disabled ? raw.color.ink100 : tokens.action.default,
  color: disabled ? tokens.text.disabled : raw.color.paper,
  fontFamily: raw.type.familyText,
  fontWeight: 700,
  fontSize: '1rem',
  cursor: disabled ? 'not-allowed' : 'pointer',
});
