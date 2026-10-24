import { Panel } from './ui.js';

/**
 * The zero-listing dashboard. Not a "no data" table: three concrete steps, each with a time
 * estimate, and one button. Time-to-first-listing (brief 04's exit test) is won or lost here.
 */
export function GettingStarted({ onStart }: { onStart?: () => void }) {
  return (
    <Panel title="Start with one watch" subtitle="About 12 minutes, and you can stop after any step." id="getting-started">
      <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <li>
          <strong>Describe it honestly.</strong> Category, model and a condition record. “I don’t know” is an allowed answer, and
          it is better than a guess.
        </li>
        <li>
          <strong>Photograph it in daylight.</strong> Three photographs: dial, case back, and any mark you disclosed. We strip the
          location from every photo before it is stored.
        </li>
        <li>
          <strong>Set a price and submit.</strong> A reviewer checks the record. You will see exactly who is waiting on what.
        </li>
      </ol>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <a className="button" href="/listings/new" onClick={onStart ? (e) => { e.preventDefault(); onStart(); } : undefined}>
          Start your first listing
        </a>
        <a className="button secondary" href="/onboarding">
          See what sellers need first
        </a>
      </div>
      <p style={{ margin: 0, color: 'var(--ink-500)', fontSize: '0.875rem' }}>
        You can list without a 3D capture. Photographs and a written condition record are enough for a buyer to decide.
      </p>
    </Panel>
  );
}
