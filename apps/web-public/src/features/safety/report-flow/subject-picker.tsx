import { raw, tokens } from '@nastech/design-tokens';
import type { ReportSubject } from '../api/safety-transport.js';
import { SUBJECT_KIND_LABELS, describeSubject } from '../flag-context.js';

/**
 * Shows the pre-filled subject from the page the person reported from — selected, visible, and
 * changeable. A silent pre-fill is how the wrong account gets a report against it; the person
 * must see who is on the hook before they write a word.
 */
export function SubjectPicker({
  catalogue,
  selected,
  prefilled,
  onSelect,
}: {
  readonly catalogue: readonly ReportSubject[];
  readonly selected: ReportSubject | null;
  readonly prefilled: ReportSubject | null;
  readonly onSelect: (subject: ReportSubject) => void;
}) {
  const isSelected = (s: ReportSubject) =>
    selected !== null && selected.kind === s.kind && selected.id === s.id;

  return (
    <fieldset
      className="safety-report-subject"
      style={{ border: 'none', margin: 0, padding: 0, fontFamily: raw.type.familyText }}
    >
      <legend style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: raw.space.s2 }}>
        Who or what are you reporting?
      </legend>
      {prefilled && !isSelected(prefilled) ? (
        <p style={{ color: raw.color.signalCaution, fontSize: '0.85rem', marginTop: 0 }}>
          You opened this from “{describeSubject(prefilled)}”, but you changed the subject above.
        </p>
      ) : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {catalogue.map((subject) => (
          <li key={`${subject.kind}:${subject.id}`} style={{ marginBottom: raw.space.s2 }}>
            <label
              style={{
                display: 'flex',
                gap: raw.space.s2,
                alignItems: 'baseline',
                cursor: 'pointer',
                padding: raw.space.s2,
                border: `1px solid ${isSelected(subject) ? raw.color.accent600 : raw.color.ink100}`,
                borderRadius: raw.radius.md,
              }}
            >
              <input
                type="radio"
                name="report-subject"
                checked={isSelected(subject)}
                onChange={() => onSelect(subject)}
                data-testid={`subject-${subject.kind}-${subject.id}`}
              />
              <span>
                <span style={{ fontWeight: 600 }}>{SUBJECT_KIND_LABELS[subject.kind]}</span>
                {' — '}
                {subject.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: '0.8rem', color: tokens.text.secondary }}>
        If what you want to report is not in this list, pick the closest one and describe the rest —
        a human reads every report.
      </p>
    </fieldset>
  );
}
