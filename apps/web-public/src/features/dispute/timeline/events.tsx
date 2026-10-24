/**
 * The case file, in the order it happened.
 *
 * Two rendering rules, both about money.
 *
 * First: `moneyBearing` decides the shape of a row. `refund_requested` is `REFUND_INITIATED` in the
 * ledger, which moves nothing; the row that renders it must not look like the row that renders
 * `refund_settled`, and a seller reading a list where both are plain text is being told their money
 * has gone when it has not.
 *
 * Second: ordering is by the service's `at`, oldest first, with no client-side re-sorting by arrival.
 * A retried request can deliver events out of order, and a timeline that orders by arrival is a
 * timeline that says the reply came before the question.
 */

import { raw, tokens } from '@nastech/design-tokens';
import type { TimelineEventDto } from '../api/dispute-transport.js';
import { formatTimestamp } from '../clock.js';
import { Body, Panel } from '../ui.js';

export interface EventRowCopy {
  readonly marker: string;
  readonly markerColour: string;
  readonly moneyNote: string | null;
}

/**
 * Pure, and asserted in `intake.test.tsx`: the money-bearing distinction has to survive somebody
 * restyling this list, and a test on the copy function is the cheapest way to make it survive.
 */
export function eventRowCopy(event: TimelineEventDto): EventRowCopy {
  if (event.kind === 'refund_requested') {
    return { marker: '↻', markerColour: raw.color.accent600, moneyNote: 'Nothing has moved. A request is not a payment.' };
  }
  if (event.kind === 'refund_settled') {
    return { marker: '✓', markerColour: raw.color.signalPositive, moneyNote: 'Booked in the ledger.' };
  }
  if (event.moneyBearing) {
    return { marker: 'R', markerColour: raw.color.accent900, moneyNote: 'Money-bearing in the ledger.' };
  }
  if (event.kind === 'outcome_offered') {
    return { marker: '…', markerColour: raw.color.ink500, moneyNote: 'A proposal. No decision has been made.' };
  }
  if (event.actor === 'service') {
    return { marker: '·', markerColour: raw.color.ink500, moneyNote: null };
  }
  return { marker: '·', markerColour: raw.color.ink300, moneyNote: null };
}

export function orderedEvents(events: readonly TimelineEventDto[]): readonly TimelineEventDto[] {
  return [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function TimelineEvents({ events, party }: { events: readonly TimelineEventDto[]; party: 'buyer' | 'seller' }) {
  const rows = orderedEvents(events);
  return (
    <Panel title="What has happened so far" id="dp-timeline" meta="In the order the service recorded it.">
      <div style={{ display: 'grid', gap: raw.space.s3 }}>
        {rows.length === 0 ? (
          <Body size="small">The case file has no entries yet.</Body>
        ) : (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: raw.space.s3 }}>
            {rows.map((event) => {
              const copy = eventRowCopy(event);
              return (
                <li
                  key={event.id}
                  data-kind={event.kind}
                  data-money-bearing={event.moneyBearing ? 'true' : 'false'}
                  style={{ display: 'grid', gap: raw.space.s1, paddingLeft: raw.space.s3, borderLeft: `2px solid ${raw.color.ink100}` }}
                >
                  <div style={{ display: 'flex', gap: raw.space.s2, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span aria-hidden="true" style={{ color: copy.markerColour, fontWeight: 700, fontFamily: raw.type.familyMono }}>
                      {copy.marker}
                    </span>
                    <strong style={{ fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary }}>{event.title}</strong>
                    <span style={{ fontSize: '0.75rem', color: tokens.text.disabled }}>{formatTimestamp(event.at)}</span>
                    <span style={{ fontSize: '0.75rem', color: tokens.text.secondary }}>
                      {event.actor === 'service' ? 'NasTech' : event.actor === party ? 'you' : 'the other party'}
                    </span>
                  </div>
                  <p style={{ margin: 0, paddingLeft: '1.4rem', fontFamily: raw.type.familyText, fontSize: '0.875rem', lineHeight: 1.55, color: tokens.text.primary }}>
                    {event.body}
                  </p>
                  {copy.moneyNote !== null ? (
                    <p style={{ margin: 0, paddingLeft: '1.4rem', fontSize: '0.8125rem', color: raw.color.signalCaution }}>
                      {copy.moneyNote}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        <Body size="small">
          This list is the record of a case being read. It is not a scoreboard: an entry saying something
          was requested is not an entry saying it was granted, and a gap in it is not a verdict either.
        </Body>
      </div>
    </Panel>
  );
}
