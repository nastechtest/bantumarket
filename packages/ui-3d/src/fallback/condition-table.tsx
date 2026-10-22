import type { ConditionCaption } from '@nastech/api-contracts';

/**
 * The written condition disclosure (07 §4.4). This is the artefact the dispute process reads, so it
 * is plain text in a plain table: no images, no fetch, no canvas, nothing that can fail the way a
 * render fails. A model conveys a claim only if the text says it too, and the text is the record.
 */

/**
 * `unknown` leads because it is the one severity the buyer cannot resolve themselves. A cosmetic
 * scratch is legible in the poster; "crystal replaced, not verified" is a question for the handover.
 */
export const SEVERITY_ORDER: readonly ConditionCaption['severity'][] = ['unknown', 'functional', 'cosmetic'];

const SEVERITY_LABEL: Readonly<Record<ConditionCaption['severity'], string>> = {
  unknown: 'Not established',
  functional: 'Functional',
  cosmetic: 'Cosmetic',
};

function rank(severity: ConditionCaption['severity']): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  // An unlisted severity sorts with `unknown` rather than silently to the back of the table.
  return index === -1 ? 0 : index;
}

/** Pure so the dispute tooling and the page cannot disagree about the reading order. */
export function orderCaptions(captions: readonly ConditionCaption[]): readonly ConditionCaption[] {
  return [...captions].sort((a, b) => {
    const bySeverity = rank(a.severity) - rank(b.severity);
    // disclosureId breaks ties so the ordering is identical on every render and in every locale.
    return bySeverity !== 0 ? bySeverity : a.disclosureId.localeCompare(b.disclosureId);
  });
}

export interface ConditionTableProps {
  readonly captions: readonly ConditionCaption[];
  /** Names the record the dispute opens against, when the caller has it. */
  readonly listingId?: string;
}

export function ConditionTable({ captions, listingId }: ConditionTableProps) {
  const ordered = orderCaptions(captions);
  const unknownCount = ordered.filter((c) => rank(c.severity) === 0).length;

  return (
    <section className="nt-condition" aria-labelledby="nt-condition-heading">
      <h2 id="nt-condition-heading" className="nt-condition__title">
        Condition, in words
      </h2>
      <p className="nt-condition__summary">
        {ordered.length === 0
          ? 'No condition notes were recorded for this item.'
          : `${ordered.length} note${ordered.length === 1 ? '' : 's'} about this item's condition${
              unknownCount > 0 ? `, ${unknownCount} of them unresolved and listed first` : ''
            }. These words are what a dispute is decided on — the photographs only show the outside.`}
      </p>
      {ordered.length === 0 ? null : (
        <table className="nt-condition__table">
          <thead>
            <tr>
              <th scope="col">Severity</th>
              <th scope="col">What we noted</th>
              <th scope="col">Disclosure record</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((caption) => (
              <tr key={`${caption.disclosureId}:${caption.hotspotId}`} data-severity={caption.severity}>
                <th scope="row" className={`nt-condition__severity nt-condition__severity--${caption.severity}`}>
                  {SEVERITY_LABEL[caption.severity]}
                </th>
                <td className="nt-condition__text">{caption.disclosureText}</td>
                <td className="nt-condition__record">
                  <code>{caption.disclosureId}</code>
                  {listingId ? <span className="nt-condition__listing"> · listing {listingId}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
