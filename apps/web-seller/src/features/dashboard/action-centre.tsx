import type { AttentionItem, AttentionKind } from './api/dashboard-transport.js';
import { actionableItems, orderAttention } from './action-order.js';
import { formatCents } from '@nastech/design-system';
import { Chip, Muted, Panel, type Tone } from './ui.js';

const KIND_LABEL: Readonly<Record<AttentionKind, string>> = {
  handover_unscheduled: 'Handover',
  payout_failed: 'Payout',
  bank_details_missing: 'Bank details',
  capture_rejected: 'Capture',
  review_waiting_on_you: 'Listing',
  listing_in_review: 'In review',
  draft_unfinished: 'Draft',
  question_unanswered: 'Question',
};

const KIND_TONE: Readonly<Record<AttentionKind, Tone>> = {
  handover_unscheduled: 'progress',
  payout_failed: 'problem',
  bank_details_missing: 'caution',
  capture_rejected: 'caution',
  review_waiting_on_you: 'caution',
  listing_in_review: 'neutral',
  draft_unfinished: 'neutral',
  question_unanswered: 'neutral',
};

function formatDue(item: AttentionItem): string | null {
  if (item.dueAt === null) return null;
  const ms = Date.parse(item.dueAt);
  if (Number.isNaN(ms)) return null;
  // Relative-to-nothing formatting is not allowed: show the absolute SAST date the API sent.
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(ms));
}

export function ActionCentre({ items }: { items: readonly AttentionItem[] }) {
  const ordered = orderAttention(items);
  const actionable = actionableItems(items);
  const waiting = ordered.filter((item) => !actionable.includes(item));

  return (
    <Panel title="What needs you" subtitle={`${actionable.length} ${actionable.length === 1 ? 'thing' : 'things'} to do, ordered by what is holding your money.`} id="action-centre">
      {ordered.length === 0 ? (
        <Muted>Nothing is waiting on you. New orders and questions will appear here.</Muted>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: rawGap }}>
          {actionable.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                data-kind={item.kind}
                data-testid={`attention-${item.kind}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '4px 16px',
                  padding: '12px 0',
                  borderTop: '1px solid var(--ink-100)',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Chip>
                  <strong style={{ fontWeight: 600 }}>{item.title}</strong>
                </span>
                {item.blockingValue > 0 ? (
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatCents(item.blockingValue)}</span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span style={{ color: 'var(--ink-500)', fontSize: '0.875rem' }}>{item.detail}</span>
                {formatDue(item) ? (
                  <span style={{ color: 'var(--ink-500)', fontSize: '0.8125rem', textAlign: 'right' }}>By {formatDue(item)}</span>
                ) : (
                  <span />
                )}
              </a>
            </li>
          ))}
        </ol>
      )}

      {waiting.length > 0 ? (
        <div style={{ borderTop: '1px solid var(--ink-100)', paddingTop: '12px' }}>
          <h3 style={{ fontSize: '0.875rem', margin: 0, color: 'var(--ink-500)' }}>Waiting on us — no action needed</h3>
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {waiting.map((item) => (
              <li key={item.id} style={{ fontSize: '0.875rem', color: 'var(--ink-500)' }}>
                <a href={item.href} style={{ color: 'inherit' }}>
                  {item.title}
                </a>{' '}
                — {item.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

/** `gap` as a literal so the list cannot inherit a spacing scale the shell changes later. */
const rawGap = '4px';
