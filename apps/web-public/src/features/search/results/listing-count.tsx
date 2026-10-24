import { raw, tokens } from '@nastech/design-tokens';

/**
 * The count line. Its most important rule: a failed search never reads "0 listings" — that
 * sentence is reserved for a genuine zero result. Failing loud-as-empty is the exact confusion
 * the pilot's supply plan cannot afford, so `failed` gets its own words and never a number.
 */
export type CountPhase = 'idle' | 'loading' | 'ready' | 'zero' | 'failed';

export function ListingCount({
  phase,
  totalMatched,
  shown,
}: {
  readonly phase: CountPhase;
  readonly totalMatched: number;
  readonly shown: number;
}) {
  let text: string;
  switch (phase) {
    case 'loading':
      text = 'Searching…';
      break;
    case 'ready':
      text =
        shown >= totalMatched
          ? `${totalMatched} ${totalMatched === 1 ? 'listing' : 'listings'}`
          : `Showing ${shown} of ${totalMatched}`;
      break;
    case 'zero':
      text = 'No listings match this search';
      break;
    case 'failed':
      text = 'Count unavailable — search is not answering';
      break;
    case 'idle':
    default:
      text = '';
      break;
  }
  return (
    <p
      role="status"
      aria-live="polite"
      data-count-phase={phase}
      style={{
        margin: 0,
        minHeight: 22,
        color: tokens.text.secondary,
        fontFamily: raw.type.familyText,
        fontSize: '0.875rem',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {text}
    </p>
  );
}
