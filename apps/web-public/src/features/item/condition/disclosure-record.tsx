/**
 * One condition record, rendered as the unit the dispute process reads: its own id, its severity,
 * the seller's words, and where on the item to look. The photograph points at this; this never
 * points at the photograph.
 */

import type { ConditionRecord } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';
import { SeverityChip } from './severity-chip.js';

export function DisclosureRecord({ record }: { record: ConditionRecord }) {
  return (
    <li
      className="item-disclosure-record"
      data-disclosure-id={record.disclosureId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s1,
        padding: raw.space.s3,
        background: tokens.surface.raised,
        border: `1px solid ${raw.color.ink100}`,
        borderRadius: raw.radius.md,
        fontFamily: raw.type.familyText,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: raw.space.s2, flexWrap: 'wrap' }}>
        <SeverityChip severity={record.severity} />
        <strong style={{ color: tokens.text.primary, fontSize: '0.875rem' }}>{record.location}</strong>
      </div>
      <p style={{ margin: 0, color: tokens.text.primary, fontSize: '0.9375rem', lineHeight: 1.5 }}>{record.text}</p>
      <small style={{ color: tokens.text.disabled, fontSize: '0.75rem', fontFamily: raw.type.familyMono }}>
        record {record.disclosureId}
      </small>
    </li>
  );
}
