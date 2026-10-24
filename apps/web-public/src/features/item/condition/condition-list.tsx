/**
 * "Condition, in words" — the written record section.
 *
 * This is the load-bearing condition surface of the item page: every flaw a photograph or a model
 * conveys must appear here as text, because the text is what the dispute process reads. A listing
 * with zero declared faults says so explicitly; silence would look identical to "data missing",
 * and the whole point of the record is that you can tell those apart.
 */

import type { ConditionRecord } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';
import { DisclosureRecord } from './disclosure-record.js';

export interface ConditionListProps {
  readonly records: readonly ConditionRecord[];
  readonly headingId?: string;
}

export function ConditionList({ records, headingId = 'item-condition-heading' }: ConditionListProps) {
  return (
    <section aria-labelledby={headingId} style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3 }}>
      <h2 id={headingId} style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.25rem', color: tokens.text.primary }}>
        Condition, in words
      </h2>
      {records.length === 0 ? (
        <p data-variant="no-declared-faults" style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem', fontFamily: raw.type.familyText }}>
          The seller has declared nothing wrong with this item. That is a statement, not an
          absence — ask below if you want it in writing before you buy.
        </p>
      ) : (
        <>
          <ol style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, margin: 0, padding: 0, listStyle: 'none' }}>
            {records.map((record) => (
              <DisclosureRecord key={record.disclosureId} record={record} />
            ))}
          </ol>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
            {records.length} declared {records.length === 1 ? 'record' : 'records'}. These texts —
            not the photographs that point at them — are what a dispute is judged on.
          </p>
        </>
      )}
    </section>
  );
}
