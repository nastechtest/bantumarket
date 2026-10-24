/**
 * Getting the item back, without inventing a collection.
 *
 * The service returns `scheduledFor: null` and `trackingRef: null` more often than not: nobody has
 * booked a courier at the moment a return is agreed, and a screen that prints "Collection Thursday
 10:00–12:00" because the layout has a slot for it is making a promise on a booking that does not
 * exist. So both fields render only when they carry a value, and the empty state says plainly that the
 * date has not been set by anyone.
 *
 * The registered-post line is not filler. In a one-city pilot where most handovers are in person, a
 * postal receipt is the only artefact that proves the item left the buyer's hands, and the dispute
 * reads evidence rather than memory.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { ReturnInstructionDto } from '../api/dispute-transport.js';
import { formatLongDate } from '../clock.js';
import { ActionButton, Body, Panel } from '../ui.js';

export type ReturnMethod = ReturnInstructionDto['method'];

export const RETURN_METHOD_COPY: Readonly<Record<ReturnMethod, { label: string; whoPays: string; caveat: string }>> = {
  collect: {
    label: 'A courier collects it from you',
    whoPays: 'Arranged through the platform when the service books it.',
    caveat: 'Nothing is booked until the service gives you a date. Until then this is a choice, not an arrangement.',
  },
  post: {
    label: 'You post it back, registered',
    whoPays: 'You pay, and the receipt is the evidence — keep it until the refund is booked.',
    caveat: 'Insure it for the sale price. A parcel posted uninsured and lost is a dispute about a parcel, not about a watch.',
  },
  meet: {
    label: 'You and the seller meet again',
    whoPays: 'No cost, and no platform record either.',
    caveat: 'A handover that is not recorded on this platform leaves the case file exactly where it is now.',
  },
};

export interface ReturnInstructionProps {
  readonly instruction: ReturnInstructionDto | null;
  readonly onRequest: (method: ReturnMethod) => void;
  readonly onConfirmReceived: () => void;
  readonly busy: boolean;
  readonly party: 'buyer' | 'seller';
}

export function ReturnInstruction({ instruction, onRequest, onConfirmReceived, busy, party }: ReturnInstructionProps) {
  const [method, setMethod] = useState<ReturnMethod>('collect');
  const copy = RETURN_METHOD_COPY[method];

  return (
    <Panel title="If the item has to go back" id="dp-return" tone="neutral">
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        {instruction === null ? (
          <>
            <Body size="small">
              No return has been arranged for this dispute yet. If the proposal you are reading says the item
              must come back, choose how — the choice is recorded and the service takes it from there.
            </Body>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: raw.space.s2 }}>
              <legend style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: raw.type.familyText }}>
                How it goes back
              </legend>
              {(Object.keys(RETURN_METHOD_COPY) as ReturnMethod[]).map((key) => (
                <label key={key} htmlFor={`dp-return-${key}`} style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start', fontFamily: raw.type.familyText, fontSize: '0.9375rem' }}>
                  <input
                    id={`dp-return-${key}`}
                    type="radio"
                    name="return-method"
                    checked={method === key}
                    onChange={() => setMethod(key)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    {RETURN_METHOD_COPY[key].label}
                    <span style={{ display: 'block', fontSize: '0.8125rem', color: tokens.text.secondary }}>
                      {RETURN_METHOD_COPY[key].whoPays}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Body size="small">{copy.caveat}</Body>
            <div>
              <ActionButton onClick={() => onRequest(method)} disabled={busy}>
                Record this choice
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            <Body>
              <strong>{RETURN_METHOD_COPY[instruction.method].label}.</strong> Chosen on{' '}
              {formatLongDate(instruction.issuedAt)}.
            </Body>
            <p style={{ margin: 0, padding: raw.space.s3, background: tokens.surface.raised, borderRadius: raw.radius.md, fontFamily: raw.type.familyText, fontSize: '0.9375rem', lineHeight: 1.55 }}>
              {instruction.instructions}
            </p>
            <dl style={{ margin: 0, display: 'grid', gap: raw.space.s2 }}>
              <Field label="Collection date">
                {instruction.scheduledFor === null ? (
                  <span data-testid="dp-return-unbooked">Not booked by anyone yet. You will hear from the service when it is.</span>
                ) : (
                  formatLongDate(instruction.scheduledFor)
                )}
              </Field>
              <Field label="Tracking">
                {instruction.trackingRef === null ? 'No reference exists yet. Anything you write here is not a booking.' : instruction.trackingRef}
              </Field>
            </dl>
            {party === 'buyer' ? (
              <Body size="small">
                When the seller says the item is back, that is recorded as their account of it. A reviewer still
                has to open the file; the item arriving is not the dispute ending.
              </Body>
            ) : (
              <div>
                <ActionButton emphasis="secondary" onClick={onConfirmReceived} disabled={busy}>
                  I have the item back
                </ActionButton>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.text.secondary }}>{label}</dt>
      <dd style={{ margin: `${raw.space.s1} 0 0`, fontFamily: raw.type.familyText, fontSize: '0.9375rem', lineHeight: 1.5 }}>{children}</dd>
    </div>
  );
}
