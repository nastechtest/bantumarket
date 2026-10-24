import { useState } from 'react';
import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { QcCheck, RenditionRow } from '../features/operations/fixtures-market.js';
import { CAPTURE_QC } from '../features/operations/fixtures-market.js';
import type { Column } from '../features/operations/ui.js';
import { DataTable, Intro, Reference, StatusTag, TwoColumn } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import { ActionButton, CheckRow, KeyValue, Notice, PageHeader, Panel, Section } from '../shell/ui.js';

function formatBytes(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

const RENDITION_COLUMNS: readonly Column<RenditionRow>[] = [
  { key: 'kind', header: 'Rendition', render: (row) => <StatusTag tone="info">{row.kind}</StatusTag> },
  { key: 'lod', header: 'Level', render: (row) => row.lod },
  { key: 'size', header: 'Size', align: 'end', render: (row) => formatBytes(row.bytes) },
  { key: 'hash', header: 'SHA-256 prefix', render: (row) => <Reference>{row.hash}</Reference> },
];

const CHECK_COLUMNS: readonly Column<QcCheck>[] = [
  { key: 'check', header: 'QC check', render: (row) => row.label },
  { key: 'detail', header: 'What to look for', render: (row) => row.detail },
];

/** Route '/listings/:id/capture', class 'scene'. QC of a captured listing. */
export default function CaptureQc({ route }: { route: RouteDef }) {
  const job = CAPTURE_QC;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = job.checks.every((check) => checked[check.id] === true);

  return (
    <>
      <PageHeader
        title={route.label}
        kicker="Capture quality control"
        actions={<StatusTag tone="caution">Awaiting QC</StatusTag>}
      />
      <Intro>
        Capture QC is the last check before a rendition is attached to a listing. Review every frame against the claim
        scope, then record the pass. The decision is about the evidence in front of you, not about the 3D viewer.
      </Intro>

      <TwoColumn>
        <Panel title="Capture job">
          <KeyValue
            items={[
              { term: 'Job', detail: <Reference>{job.jobId}</Reference> },
              { term: 'Listing', detail: <Reference>{job.listingId}</Reference> },
              { term: 'Item', detail: job.title },
              { term: 'Seller', detail: job.seller },
              { term: 'Operator', detail: job.operator },
              { term: 'Captured', detail: formatInstant(job.capturedAt) },
            ]}
          />
          <p style={{ margin: 0 }}>
            <a href={`/listings/${job.listingId}`} style={{ color: tokens.action.default }}>
              Back to the listing review
            </a>
          </p>
        </Panel>
        <Panel title="Claim scope" tone="caution">
          <p style={{ margin: 0 }}>{job.claimScope}</p>
          <p style={{ margin: 0, color: tokens.text.secondary }}>
            A rendition cannot prove that a watch runs, that a bag is genuine, or that an item is water-resistant. The
            listing copy must not imply any of those.
          </p>
        </Panel>
      </TwoColumn>

      <Section title="Renditions">
        <DataTable
          caption="Renditions generated from this capture job"
          columns={RENDITION_COLUMNS}
          rows={job.renditions}
          rowKey={(row) => `${row.kind}-${row.lod}`}
        />
      </Section>

      <Section title="Required checks">
        <DataTable
          caption="QC checks that must be completed before a pass"
          columns={CHECK_COLUMNS}
          rows={job.checks}
          rowKey={(row) => row.id}
        />
        <Panel>
          {job.checks.map((check) => (
            <CheckRow
              key={check.id}
              id={`qc-${check.id}`}
              label={check.label}
              checked={checked[check.id] === true}
              onChange={(next) => setChecked((current) => ({ ...current, [check.id]: next }))}
            />
          ))}
          <ActionButton
            label="Pass capture QC"
            onClick={() => undefined}
            disabled={!allChecked}
            disabledReason={allChecked ? undefined : 'Complete every required check before passing this rendition.'}
          />
        </Panel>
      </Section>

      <Notice tone="info" title="What a pass records">
        Operator, reviewer, job id and the UTC time. No image is copied into the audit trail, and the seller’s payout
        details are not part of this screen.
      </Notice>
    </>
  );
}
