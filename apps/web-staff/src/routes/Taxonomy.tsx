import { useState } from 'react';
import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { CategoryRow, TaxonomyChange } from '../features/operations/fixtures-market.js';
import { CATEGORY_ROWS, TAXONOMY_CHANGES } from '../features/operations/fixtures-market.js';
import type { Column, Tone } from '../features/operations/ui.js';
import { DataTable, Intro, Reference, StatStrip, StatusTag } from '../features/operations/ui.js';
import {
  ActionButton,
  CheckRow,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  Section,
  SelectField,
  TextArea,
} from '../shell/ui.js';

const MERGE_SOURCE = CATEGORY_ROWS.find((row) => row.id === 'cat_watches_sports');

function statusTone(status: CategoryRow['status']): Tone {
  if (status === 'Active') return 'positive';
  if (status === 'Draft') return 'caution';
  return 'negative';
}

const CATEGORY_COLUMNS: readonly Column<CategoryRow>[] = [
  {
    key: 'path',
    header: 'Category',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span>{row.path}</span>
        <Reference>{row.slug}</Reference>
      </div>
    ),
  },
  { key: 'listings', header: 'Listings', align: 'end', render: (row) => row.listings.toLocaleString('en-ZA') },
  {
    key: 'attributes',
    header: 'Required attributes',
    render: (row) => (
      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.attributes.join(', ')}</span>
    ),
  },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
  { key: 'owner', header: 'Owner', render: (row) => row.owner },
];

const CHANGE_COLUMNS: readonly Column<TaxonomyChange>[] = [
  { key: 'change', header: 'Change', render: (row) => <Reference>{row.id}</Reference> },
  { key: 'kind', header: 'Kind', render: (row) => <StatusTag tone="info">{row.kind}</StatusTag> },
  { key: 'summary', header: 'Summary', render: (row) => row.summary },
  { key: 'requested', header: 'Requested by', render: (row) => row.requestedBy },
  { key: 'age', header: 'Age', align: 'end', render: (row) => row.age },
];

const MERGE_OPTIONS = [
  { value: '', label: 'Select the surviving category' },
  ...CATEGORY_ROWS.filter((row) => row.id !== 'cat_watches_sports').map((row) => ({
    value: row.id,
    label: `${row.path} (${row.listings.toLocaleString('en-ZA')} listings)`,
  })),
];

/** Route '/taxonomy', class 'app'. The catalogue tree and its pending changes. */
export default function Taxonomy({ route }: { route: RouteDef }) {
  const [mergeInto, setMergeInto] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const reasonReady = reason.trim().length >= 12;
  const canMerge = mergeInto !== '' && reasonReady && confirmed;

  return (
    <>
      <PageHeader title={route.label} kicker="Catalogue administration" />
      <Intro>
        The category tree is how buyers find an item and how sellers know which attributes to supply. Changes here
        affect search, saved searches and every seller form. A merge is reversible only by an administrator.
      </Intro>
      <StatStrip
        items={[
          { label: 'Live categories', value: '428' },
          { label: 'Pending changes', value: '3', tone: 'caution' },
          { label: 'Draft categories', value: '1' },
          { label: 'Listings in merge source', value: '312' },
        ]}
      />

      <Section title="Category tree">
        <DataTable
          caption="Top-level categories and their required attributes"
          columns={CATEGORY_COLUMNS}
          rows={CATEGORY_ROWS}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title="Pending changes">
        <DataTable
          caption="Catalogue changes waiting for a decision"
          columns={CHANGE_COLUMNS}
          rows={TAXONOMY_CHANGES}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title="Merge categories">
        <Panel tone="caution">
          {MERGE_SOURCE === undefined ? null : (
            <KeyValue
              items={[
                { term: 'Merge source', detail: `${MERGE_SOURCE.path} — ${MERGE_SOURCE.listings} listings` },
                { term: 'Slug', detail: <Reference>{MERGE_SOURCE.slug}</Reference> },
                { term: 'Effect', detail: 'Listings move to the surviving category; the source slug redirects for 90 days.' },
              ]}
            />
          )}
          <SelectField
            id="taxonomy-merge-target"
            label="Merge into"
            value={mergeInto}
            options={MERGE_OPTIONS}
            onChange={setMergeInto}
            hint="The surviving category keeps its slug and attributes."
          />
          <TextArea
            id="taxonomy-merge-reason"
            label="Reason"
            value={reason}
            onChange={setReason}
            rows={3}
            hint="At least 12 characters. Say what sellers and buyers should expect."
          />
          <CheckRow
            id="taxonomy-merge-confirm"
            label="I have checked that the surviving category has every attribute the source uses."
            checked={confirmed}
            onChange={setConfirmed}
          />
          <ActionButton
            label="Merge categories"
            tone="danger"
            onClick={() => undefined}
            disabled={!canMerge}
            disabledReason={
              mergeInto === ''
                ? 'Choose the surviving category first.'
                : !reasonReady
                  ? 'Give a reason of at least 12 characters.'
                  : !confirmed
                    ? 'Confirm the surviving category covers the source attributes.'
                    : undefined
            }
          />
        </Panel>
        <Notice tone="info" title="What a merge changes">
          {MERGE_SOURCE?.listings ?? 0} listings move category, saved searches are rewritten, and the old slug
          redirects for 90 days. The change is stamped with the administrator, the reason and the UTC time.
        </Notice>
      </Section>
    </>
  );
}
