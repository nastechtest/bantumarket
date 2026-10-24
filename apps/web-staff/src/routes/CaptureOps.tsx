import type { RouteDef } from '../router.js';
import type { CaptureCapacity, CaptureJob } from '../features/operations/fixtures-market.js';
import { CAPTURE_CAPACITY, CAPTURE_JOBS } from '../features/operations/fixtures-market.js';
import type { Column, Tone } from '../features/operations/ui.js';
import { DataTable, Intro, Reference, StatStrip, StatusTag } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import { Notice, PageHeader, Section } from '../shell/ui.js';

function statusTone(status: CaptureJob['status']): Tone {
  if (status === 'Failed') return 'negative';
  if (status === 'In progress') return 'caution';
  if (status === 'QC pending') return 'info';
  return 'neutral';
}

const JOB_COLUMNS: readonly Column<CaptureJob>[] = [
  {
    key: 'job',
    header: 'Job',
    render: (row) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span>{row.title}</span>
        <Reference>{row.id}</Reference>
      </div>
    ),
  },
  { key: 'listing', header: 'Listing', render: (row) => <Reference>{row.listingId}</Reference> },
  { key: 'seller', header: 'Seller', render: (row) => row.seller },
  { key: 'where', header: 'Studio', render: (row) => `${row.city} — ${row.studio}` },
  { key: 'when', header: 'Scheduled (UTC)', render: (row) => formatInstant(row.scheduledFor) },
  { key: 'operator', header: 'Operator', render: (row) => row.operator },
  { key: 'status', header: 'Status', render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
  { key: 'note', header: 'Note', render: (row) => row.note },
];

const CAPACITY_COLUMNS: readonly Column<CaptureCapacity>[] = [
  { key: 'city', header: 'City', render: (row) => row.city },
  { key: 'studio', header: 'Studio', render: (row) => row.studio },
  { key: 'slots', header: 'Slots', align: 'end', render: (row) => String(row.slots) },
  { key: 'booked', header: 'Booked', align: 'end', render: (row) => String(row.booked) },
  { key: 'operators', header: 'Operators', align: 'end', render: (row) => String(row.operators) },
  { key: 'turnaround', header: 'Average turn-around', align: 'end', render: (row) => row.turnaround },
];

/** Route '/capture-ops', class 'app'. The capture programme's schedule and capacity. */
export default function CaptureOps({ route }: { route: RouteDef }) {
  return (
    <>
      <PageHeader title={route.label} kicker="Capture programme" />
      <Intro>
        Capture turns a seller’s photographs into a reviewed rendition. This is the studio schedule: who is booked,
        where, and which jobs need attention before a listing can go live.
      </Intro>
      <StatStrip
        items={[
          { label: 'Booked this week', value: '37' },
          { label: 'In progress now', value: '2', tone: 'caution' },
          { label: 'Failed intake', value: '1', tone: 'negative' },
          { label: 'Awaiting QC', value: '4' },
        ]}
      />

      <Section title="Studio schedule">
        <DataTable
          caption="Capture jobs booked for the next two days"
          columns={JOB_COLUMNS}
          rows={CAPTURE_JOBS}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title="Capacity by city">
        <DataTable
          caption="Capture capacity and average turn-around per studio"
          columns={CAPACITY_COLUMNS}
          rows={CAPTURE_CAPACITY}
          rowKey={(row) => row.city}
        />
      </Section>

      <Notice tone="caution" title="High-value intake">
        Watches and jewellery above R20,000 are captured under the two-person rule. The second person must be named on
        the job before the item leaves the intake desk; their name is written to the audit entry, not a photograph.
      </Notice>
    </>
  );
}
