import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDateTime } from '../../lib/dates.js';
import { CAPTURE_BREAK_EVEN, CAPTURE_PRICE, sellerFeePercentLabel } from '../../lib/pricing.js';
import { Chip, EmptyNote, KeyValue, Note, Panel } from '../../ui/primitives.js';
import { captureJobFor, listingById } from './api/listing-fixtures.js';

const STATE_LABEL: Readonly<Record<string, string>> = {
  booked: 'Booked in',
  captured: 'Photographed',
  qc_auto: 'Automatic checks',
  qc_human: 'With a reviewer',
  published: 'Ready to show',
  failed: 'Could not be produced',
  none: 'Not booked',
};

function Marker({ state }: { readonly state: 'passed' | 'current' | 'waiting' }) {
  const glyph = state === 'passed' ? '✓' : state === 'current' ? '●' : '○';
  const colour =
    state === 'passed' ? raw.color.signalPositive : state === 'current' ? raw.color.accent600 : raw.color.ink300;
  return (
    <span aria-hidden="true" style={{ color: colour, width: 20, flex: 'none', textAlign: 'center' }}>
      {glyph}
    </span>
  );
}

export function CapturePreviewPage({ listingId }: { readonly listingId: string | null }) {
  const listing = listingById(listingId);

  if (listing === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <PageHeader title="Capture review" eyebrow="3D preview" description="No listing matches this capture link." />
        <EmptyNote
          title="The capture job could not be found"
          body="Capture links point at one listing. Open the listing itself and use its capture button."
          action={<a className="button" href="/listings">Back to my listings</a>}
        />
      </div>
    );
  }

  const job = captureJobFor(listing.id);
  const passed = job.qcChecks.filter((check) => check.state === 'passed').length;
  const percent = Math.round((passed / job.qcChecks.length) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Capture review"
        eyebrow={`${listing.title} · ${listing.id}`}
        description="The studio photographs the physical watch on a calibrated turntable. This page shows whether the run is usable and what it costs — never a claim about how the watch runs."
      >
        <a className="button secondary" href={`/listings/${listing.id}`}>
          Back to listing
        </a>
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Panel
          title="The 360 run"
          description={`${job.studio} · booked ${sastDateTime(job.bookedAt)}`}
          actions={<Chip tone="progress">{STATE_LABEL[job.state] ?? job.state}</Chip>}
          id="capture-run"
        >
          <div
            style={{
              background: `linear-gradient(135deg, ${raw.color.ink900}, ${raw.color.ink700})`,
              color: tokens.text.onInverse,
              borderRadius: raw.radius.lg,
              minHeight: '220px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: raw.space.s4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8125rem', opacity: 0.8 }}>Frame {Math.round(job.framesCaptured / 2)} of {job.framesRequired}</span>
              <span style={{ fontSize: '0.8125rem', opacity: 0.8 }}>50 mm reference bar in frame</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                aria-hidden="true"
                style={{
                  width: 118,
                  height: 118,
                  borderRadius: '50%',
                  border: `6px solid ${raw.color.accent300}`,
                  borderTopColor: raw.color.paper,
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: raw.type.familyDisplay,
                  fontSize: '1.5rem',
                }}
              >
                360°
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: '0.8125rem', opacity: 0.8 }}>
              <span>Turntable: calibrated</span>
              <span>Lighting: diffuse</span>
            </div>
          </div>

          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Capture review ${percent}% complete`} style={{ height: 6, background: raw.color.ink100, borderRadius: 999 }}>
            <div style={{ width: `${percent}%`, height: '100%', background: raw.color.accent600, borderRadius: 999 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <KeyValue label="Frames">{job.framesCaptured} / {job.framesRequired}</KeyValue>
            <KeyValue label="Turntable">{job.turntableCalibrated ? 'Calibrated' : 'Not calibrated'}</KeyValue>
            <KeyValue label="Reference object">{job.referenceInFrame ? 'In frame' : 'Missing'}</KeyValue>
            <KeyValue label="Last update">{sastDateTime(job.updatedAt)}</KeyValue>
          </div>

          {job.state === 'qc_human' ? (
            <Note tone="progress" title="With a reviewer">
              The automatic checks passed. A reviewer compares the 360 frames with your written condition record; the 3D view
              appears on the listing only after that comparison finishes.
            </Note>
          ) : null}
        </Panel>

        <Panel title="What the capture costs" id="capture-cost">
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55 }}>
            <MoneyText value={CAPTURE_PRICE} /> per capture, {sellerFeePercentLabel()} seller fee, break-even{' '}
            <MoneyText value={CAPTURE_BREAK_EVEN} />.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ color: tokens.text.secondary }}>Per capture</span>
            <strong style={{ fontSize: '1.6rem' }}><MoneyText value={CAPTURE_PRICE} /></strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ color: tokens.text.secondary }}>Seller fee</span>
            <strong>{sellerFeePercentLabel()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <span style={{ color: tokens.text.secondary }}>Break-even</span>
            <strong><MoneyText value={CAPTURE_BREAK_EVEN} /></strong>
          </div>
          <Note title="Charged once, after the run">
            <MoneyText value={CAPTURE_PRICE} /> covers the photography run and the review. If the studio cannot produce a
            usable capture, the fee is not charged. At a {sellerFeePercentLabel()} seller fee, a capture pays for itself on
            an item priced above <MoneyText value={CAPTURE_BREAK_EVEN} />.
          </Note>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            A capture is optional. Listing with photographs alone costs nothing and is a complete listing.
          </p>
        </Panel>
      </div>

      <Panel
        title="Capture checklist and quality control"
        description="Every run is checked in this order. A failed check sends the job for a reshoot instead of hiding the problem."
        id="capture-checklist"
      >
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {job.qcChecks.map((check) => (
            <li
              key={check.id}
              data-state={check.state}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 10,
                alignItems: 'start',
                padding: raw.space.s3,
                border: `1px solid ${check.state === 'current' ? raw.color.accent600 : raw.color.ink100}`,
                borderRadius: raw.radius.md,
              }}
            >
              <Marker state={check.state} />
              <div>
                <strong style={{ fontSize: '0.92rem' }}>{check.label}</strong>
                <p style={{ margin: '2px 0 0', color: tokens.text.secondary, fontSize: '0.84rem', lineHeight: 1.5 }}>
                  {check.detail}
                </p>
                <span style={{ display: 'inline-block', marginTop: 4, fontSize: '0.78rem', color: tokens.text.secondary }}>
                  {check.state === 'passed' ? 'Passed' : check.state === 'current' ? 'In progress' : 'Waiting'}
                </span>
              </div>
            </li>
          ))}
        </ol>

        <Note title="What this does and does not show">
          The capture evidences the watch’s shape and outer condition from photographs. It does not show how it runs, whether it
          is water-resistant, or whether it is authentic. Your written record and the photographs remain the description.
        </Note>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a className="button secondary" href={`/messages/thr_2002?about=${listing.id}`}>
            Report a problem with this capture
          </a>
          <a className="button secondary" href="/payouts">
            See the capture charge
          </a>
        </div>
      </Panel>
    </div>
  );
}
