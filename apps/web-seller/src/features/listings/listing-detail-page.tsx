import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDate, sastDateTime } from '../../lib/dates.js';
import { CAPTURE_PRICE, SELLER_FEE_PERCENT, sellerFeePercentLabel } from '../../lib/pricing.js';
import { Chip, EmptyNote, KeyValue, Note, Panel } from '../../ui/primitives.js';
import { STAGE_LABELS, STAGE_TONES, captureLabel, captureTone, listingById } from './api/listing-fixtures.js';

function conditionRows(id: string) {
  const listing = listingById(id);
  if (listing === null) return [];
  return [
    { key: 'overall', label: 'Overall', value: listing.condition.overall },
    { key: 'case', label: 'Case', value: listing.condition.case },
    { key: 'crystal', label: 'Crystal', value: listing.condition.crystal },
    { key: 'bracelet', label: 'Bracelet or strap', value: listing.condition.bracelet },
    { key: 'notes', label: 'Notes for buyers', value: listing.condition.notes },
  ];
}

export function ListingDetailPage({ listingId }: { readonly listingId: string | null }) {
  const listing = listingById(listingId);

  if (listing === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <PageHeader title="Listing not found" eyebrow="Selling" description="That listing id is not in your workspace." />
        <EmptyNote
          title="This listing may have been removed"
          body="It could belong to another seller, or the link may have lost part of the id. Your own listings are all on one page."
          action={<a className="button" href="/listings">Back to my listings</a>}
        />
      </div>
    );
  }

  const photosTaken = listing.photos.filter((photo) => photo.taken).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title={listing.title}
        eyebrow={`${listing.brand} · ${listing.id}`}
        description={listing.description}
      >
        {listing.stage === 'draft' ? (
          <a className="button" href={`/listings/new?draft=${listing.id}`}>
            Finish draft
          </a>
        ) : null}
        <a className="button secondary" href={`/listings/${listing.id}/capture`}>
          {listing.capture === 'none' ? 'Book a 3D capture' : 'View capture review'}
        </a>
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <Panel title="Listing status" id="listing-status">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Chip tone={STAGE_TONES[listing.stage]}>{STAGE_LABELS[listing.stage]}</Chip>
            <Chip tone={captureTone(listing.capture)}>{captureLabel(listing.capture)}</Chip>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <KeyValue label="Asking price">
              <MoneyText value={listing.price} />
            </KeyValue>
            <KeyValue label="Submitted">{listing.submittedAt === null ? 'Not submitted' : sastDate(listing.submittedAt)}</KeyValue>
            <KeyValue label="Last change">{sastDateTime(listing.updatedAt)}</KeyValue>
          </div>
          {listing.stage === 'in_review' ? (
            <Note tone="progress" title="With a NasTech reviewer">
              A reviewer checks the photographs and the condition record. Usually under four working hours. No action is needed
              from you, and the listing is not visible to buyers until it passes.
            </Note>
          ) : null}
          {listing.stage === 'live' ? (
            <Note tone="success" title="Visible to buyers">
              Buyers can open this listing and message you. The price is fixed for now; edit it from the draft flow.
            </Note>
          ) : null}
        </Panel>

        <Panel title="Your money on a sale" id="listing-money">
          <KeyValue label="Buyer pays">
            <MoneyText value={listing.price} />
          </KeyValue>
          <KeyValue label="Seller success fee">{sellerFeePercentLabel()}</KeyValue>
          <KeyValue label="You receive on completion">
            <MoneyText value={listing.price} />
          </KeyValue>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            A 3D capture costs <MoneyText value={CAPTURE_PRICE} /> and is optional. At a {SELLER_FEE_PERCENT}% seller fee the
            capture pays for itself on items above R2,700.
          </p>
        </Panel>
      </div>

      <Panel title="Specification" description="What the buyer sees on the listing." id="listing-spec">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <KeyValue label="Brand">{listing.brand}</KeyValue>
          <KeyValue label="Model">{listing.model}</KeyValue>
          <KeyValue label="Reference">{listing.reference}</KeyValue>
          <KeyValue label="Year">{listing.year}</KeyValue>
          <KeyValue label="Case size">{listing.caseSizeMm} mm</KeyValue>
          <KeyValue label="Movement">{listing.movement}</KeyValue>
          <KeyValue label="Box">{listing.includes.box ? 'Included' : 'Not included'}</KeyValue>
          <KeyValue label="Papers">{listing.includes.papers ? 'Included' : 'Not included'}</KeyValue>
          <KeyValue label="Service history">{listing.includes.serviceHistory}</KeyValue>
        </div>
      </Panel>

      <Panel title="Condition record" description="Your written statements, which the buyer reads before paying." id="listing-condition">
        <dl style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: 0 }}>
          {conditionRows(listing.id).map((row) => (
            <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 180px) 1fr', gap: '12px' }}>
              <dt style={{ color: tokens.text.secondary, fontWeight: 600, fontSize: '0.875rem' }}>{row.label}</dt>
              <dd style={{ margin: 0, fontSize: '0.9rem' }}>{row.value.trim() === '' ? 'Not recorded yet.' : row.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel
        title="Photographs"
        description={`${photosTaken} of ${listing.photos.length} required photographs added.`}
        id="listing-photos"
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          {listing.photos.map((photo) => (
            <li
              key={photo.label}
              style={{
                border: `1px solid ${photo.taken ? raw.color.ink100 : raw.color.signalCaution}`,
                borderRadius: raw.radius.md,
                padding: raw.space.s3,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span style={{ fontWeight: 600 }}>{photo.label}</span>
              <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>{photo.requirement}</span>
              <span style={{ color: photo.taken ? raw.color.signalPositive : raw.color.signalCaution, fontSize: '0.8125rem' }}>
                {photo.taken ? 'Added' : 'Still needed'}
              </span>
            </li>
          ))}
        </ul>
        {listing.capture !== 'none' ? (
          <Note title="What the 3D preview evidences">
            The capture shows the watch’s shape and outer condition from photographs. It does not show how it runs, and it is
            not a statement about authenticity.
          </Note>
        ) : null}
      </Panel>

      {listing.stage === 'draft' ? (
        <Note tone="caution" title="Publishing is held until the required photographs are added">
          {photosTaken} of {listing.photos.length} photographs are in place. Open the draft to finish the record; a 3D capture
          remains optional.
        </Note>
      ) : null}
    </div>
  );
}
