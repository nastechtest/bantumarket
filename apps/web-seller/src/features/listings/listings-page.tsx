import { useMemo, useState } from 'react';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { countOf } from '../../lib/format.js';
import { sastDate } from '../../lib/dates.js';
import { Chip, DataTable, EmptyNote, Note, Panel, Stat, type Column } from '../../ui/primitives.js';
import {
  LISTINGS,
  STAGE_LABELS,
  STAGE_TONES,
  captureLabel,
  captureTone,
  type Listing,
  type ListingStage,
} from './api/listing-fixtures.js';

type Filter = 'all' | ListingStage;

const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'draft', label: 'Drafts' },
  { id: 'in_review', label: 'In review' },
  { id: 'sold', label: 'Sold' },
];

function matches(listing: Listing, filter: Filter, query: string): boolean {
  if (filter !== 'all' && listing.stage !== filter) return false;
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [listing.title, listing.brand, listing.reference, listing.id]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function ListingsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => LISTINGS.filter((listing) => matches(listing, filter, query)),
    [filter, query],
  );

  const live = LISTINGS.filter((listing) => listing.stage === 'live').length;
  const drafts = LISTINGS.filter((listing) => listing.stage === 'draft').length;
  const inReview = LISTINGS.filter((listing) => listing.stage === 'in_review').length;

  const columns: readonly Column<Listing>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (listing) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <a href={`/listings/${listing.id}`} style={{ color: tokens.text.primary, fontWeight: 600 }}>
            {listing.title}
          </a>
          <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            {listing.brand} · {listing.reference} · {listing.id}
          </span>
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Status',
      render: (listing) => <Chip tone={STAGE_TONES[listing.stage]}>{STAGE_LABELS[listing.stage]}</Chip>,
    },
    {
      key: 'capture',
      header: 'Preview',
      render: (listing) => <Chip tone={captureTone(listing.capture)}>{captureLabel(listing.capture)}</Chip>,
    },
    {
      key: 'price',
      header: 'Asking price',
      align: 'end',
      render: (listing) => <MoneyText value={listing.price} />,
    },
    {
      key: 'updated',
      header: 'Updated',
      render: (listing) => <span style={{ whiteSpace: 'nowrap' }}>{sastDate(listing.updatedAt)}</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'end',
      render: (listing) => (
        <a href={listing.stage === 'draft' ? `/listings/new?draft=${listing.id}` : `/listings/${listing.id}`}>
          {listing.stage === 'draft' ? 'Finish draft' : 'Open'}
        </a>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="My listings"
        eyebrow="Selling"
        description="Every watch you have drafted, submitted or sold — with the one next action on each row."
      >
        <a className="button" href="/listings/new">
          New listing
        </a>
      </PageHeader>

      <Panel title="At a glance" description={`${countOf(LISTINGS.length, 'listing')} in your workspace.`} id="listing-summary">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
          <Stat label="Live" value={live} detail="Visible to buyers now." />
          <Stat label="Drafts" value={drafts} detail="Not submitted; only you can see them." />
          <Stat label="In review" value={inReview} detail="A reviewer is checking the record." />
        </div>
      </Panel>

      <section aria-labelledby="listing-filter-title" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <h2 id="listing-filter-title" style={{ fontSize: '1.125rem' }}>
              Find a listing
            </h2>
            <p style={{ margin: '4px 0 0', color: tokens.text.secondary, fontSize: '0.875rem' }}>
              Filter by status or search the brand, reference or listing id.
            </p>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8125rem', color: tokens.text.secondary }}>
            Search listings
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Tudor or 79030B"
              style={{ minHeight: '40px', padding: '6px 10px', border: `1px solid ${raw.color.ink100}`, borderRadius: raw.radius.md, font: 'inherit' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={filter === option.id ? '' : 'secondary'}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <DataTable
          caption={`${countOf(rows.length, 'listing')} shown`}
          columns={columns}
          rows={rows}
          rowKey={(listing) => listing.id}
          empty={
            <EmptyNote
              title="No listings match that view"
              body="Clear the search or choose another status. Drafts are always kept in your workspace."
              action={
                <button type="button" className="secondary" onClick={() => { setFilter('all'); setQuery(''); }}>
                  Show all listings
                </button>
              }
            />
          }
        />
      </section>

      {drafts > 0 ? (
        <Note tone="caution" title="A draft is not visible to buyers">
          Finish the condition record and photographs, then submit for review. A 3D capture is optional and never blocks a
          photo-only listing.
        </Note>
      ) : null}
    </div>
  );
}
