import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { QueueRow } from '../features/operations/fixtures-market.js';
import { QUEUE_ROWS } from '../features/operations/fixtures-market.js';
import { Amount, DataTable, Intro, Reference, StatStrip, StatusTag } from '../features/operations/ui.js';
import type { Column } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import { Notice, PageHeader, Section } from '../shell/ui.js';

const COLUMNS: readonly Column<QueueRow>[] = [
  {
    key: 'listing',
    header: 'Listing',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <a href={`/listings/${row.id}`} style={{ color: tokens.action.default, fontWeight: 600 }}>
          {row.title}
        </a>
        <Reference>{row.id}</Reference>
      </div>
    ),
  },
  { key: 'seller', header: 'Seller', render: (row) => row.seller },
  { key: 'price', header: 'Price', align: 'end', render: (row) => <Amount cents={row.priceCents} /> },
  { key: 'submitted', header: 'Submitted (UTC)', render: (row) => formatInstant(row.submittedAt) },
  {
    key: 'flags',
    header: 'Policy flags',
    render: (row) =>
      row.flags.length === 0 ? (
        <span style={{ color: tokens.text.secondary }}>None</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {row.flags.map((flag) => (
            <StatusTag key={flag} tone="caution">
              {flag}
            </StatusTag>
          ))}
        </div>
      ),
  },
  {
    key: 'sla',
    header: 'Service level',
    render: (row) => <StatusTag tone={row.slaTone}>{row.sla}</StatusTag>,
  },
];

/** Route '/', class 'app'. The first screen an operator sees: what needs a catalogue decision. */
export default function Queue({ route }: { route: RouteDef }) {
  return (
    <>
      <PageHeader title={route.label} kicker="Catalogue decisions" />
      <Intro>
        Every new listing waits here until a reviewer records a decision. Rows past the 24-hour service level are
        called out first, and each decision is attributed to the reviewer who made it.
      </Intro>
      <StatStrip
        items={[
          { label: 'Waiting', value: '24' },
          { label: 'Past service level', value: '5', tone: 'negative' },
          { label: 'Model claims', value: '3', tone: 'caution' },
          { label: 'First-time sellers', value: '9' },
        ]}
      />
      <Section title="Waiting for review">
        <DataTable
          caption="Listings waiting for a catalogue decision, oldest service level first"
          columns={COLUMNS}
          rows={QUEUE_ROWS}
          rowKey={(row) => row.id}
        />
      </Section>
      <Notice tone="caution" title="Before you decide">
        A model rendition shows outer condition only. It is not evidence of authenticity, movement health or water
        resistance, and a listing must not claim otherwise. Takedowns need a written reason that a stranger can review
        six months from now.
      </Notice>
    </>
  );
}
