import type { DashboardListing, ListingStage } from './api/dashboard-transport.js';
import { Chip, Muted, Panel, type Tone } from './ui.js';

/**
 * A seller's mental model is "drafts, things waiting, things on sale, things sold". The nine
 * transport stages collapse into those four groups for the summary; the detail screen keeps the
 * precise stage.
 */
const GROUPS: readonly { key: string; label: string; stages: readonly ListingStage[]; tone: Tone }[] = [
  { key: 'drafts', label: 'Drafts', stages: ['draft'], tone: 'neutral' },
  { key: 'waiting', label: 'Waiting on review', stages: ['in_review', 'rejected'], tone: 'caution' },
  { key: 'on_sale', label: 'On sale', stages: ['live', 'paused'], tone: 'progress' },
  { key: 'closed', label: 'Sold or closed', stages: ['sold', 'withdrawn', 'expired'], tone: 'success' },
];

const STAGE_LABEL: Readonly<Record<ListingStage, string>> = {
  draft: 'Draft',
  in_review: 'In review',
  live: 'Live',
  paused: 'Paused',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  sold: 'Sold',
  rejected: 'Needs changes',
};

export function stageLabel(stage: ListingStage): string {
  return STAGE_LABEL[stage];
}

export function ListingStatusCards({
  byStage,
  recent,
}: {
  byStage: Readonly<Record<ListingStage, number>>;
  recent: readonly DashboardListing[];
}) {
  const inReview = recent.find((l) => l.stage === 'in_review' && l.review !== null);
  return (
    <Panel title="Your listings" actions={<a href="/listings">See all</a>} id="listing-status">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
        {GROUPS.map((group) => {
          const count = group.stages.reduce((sum, stage) => sum + byStage[stage], 0);
          return (
            <div key={group.key} style={{ border: '1px solid var(--ink-100)', borderRadius: '8px', padding: '12px' }}>
              <Chip tone={group.tone}>{group.label}</Chip>
              <p style={{ margin: '8px 0 0', fontSize: '1.5rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{count}</p>
            </div>
          );
        })}
      </div>

      {inReview && inReview.review ? (
        <div style={{ borderLeft: '3px solid var(--caution)', paddingLeft: '12px' }} data-testid="review-wait">
          <strong>{inReview.title}</strong> is with <strong>{inReview.review.waitingOn}</strong>.
          <Muted>{inReview.review.note}</Muted>
        </div>
      ) : null}

      {recent.length === 0 ? <Muted>No listings yet. Your first one starts with a category and three photographs.</Muted> : null}
    </Panel>
  );
}
