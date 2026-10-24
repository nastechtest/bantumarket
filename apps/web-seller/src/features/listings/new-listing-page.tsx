import { useState } from 'react';
import { MoneyText, Stepper, TextField, formatCents } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { CAPTURE_BREAK_EVEN, CAPTURE_PRICE, sellerFeePercentLabel } from '../../lib/pricing.js';
import { Note, Panel } from '../../ui/primitives.js';

const STEPS = [
  { label: 'Details' },
  { label: 'Condition' },
  { label: 'Photographs' },
  { label: 'Price and publish' },
] as const;

const REQUIRED_PHOTOS = [
  { id: 'dial', label: 'Dial, straight on', hint: 'No glare across the hands.' },
  { id: 'caseback', label: 'Case back', hint: 'Reference and serial legible.' },
  { id: 'clasp', label: 'Clasp or buckle', hint: 'Any stretch or mark visible.' },
  { id: 'marks', label: 'Each disclosed mark', hint: 'One close-up per mark you mention.' },
] as const;

type PhotoId = (typeof REQUIRED_PHOTOS)[number]['id'];

function parseRandsToCents(value: string): number {
  const clean = value.replace(/[^\d.]/g, '');
  const rands = Number.parseFloat(clean);
  if (!Number.isFinite(rands) || rands < 0) return 0;
  return Math.round(rands * 100);
}

export function NewListingPage() {
  const [step, setStep] = useState(0);
  const [brand, setBrand] = useState('Seiko');
  const [model, setModel] = useState('Presage Cocktail Time');
  const [reference, setReference] = useState('SRPB41J1');
  const [year, setYear] = useState('2022');
  const [caseSize, setCaseSize] = useState('40.5');
  const [movement, setMovement] = useState('Automatic, 4R35');
  const [overall, setOverall] = useState('Good');
  const [conditionNotes, setConditionNotes] = useState(
    'One faint hairline near 4 o’clock. Original bracelet included; an aftermarket leather strap is fitted.',
  );
  const [box, setBox] = useState(true);
  const [papers, setPapers] = useState(false);
  const [photos, setPhotos] = useState<Readonly<Record<PhotoId, boolean>>>({
    dial: true,
    caseback: true,
    clasp: false,
    marks: true,
  });
  const [price, setPrice] = useState('6800');
  const [captureBooked, setCaptureBooked] = useState(false);
  const [published, setPublished] = useState<'photos' | 'capture' | null>(null);
  const [saved, setSaved] = useState(false);

  const photosComplete = REQUIRED_PHOTOS.every((photo) => photos[photo.id]);
  const priceCents = parseRandsToCents(price);
  const priceValid = priceCents > 0;
  const canPublish = photosComplete && priceValid;
  const canPublishCapture = canPublish && captureBooked;

  function togglePhoto(id: PhotoId) {
    setPhotos((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="New listing"
        eyebrow="Draft · Seiko Presage Cocktail Time"
        description="Four short steps. You can stop after any of them and the draft stays in your workspace."
      >
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setSaved(true);
          }}
        >
          Save draft
        </button>
      </PageHeader>

      <Stepper steps={STEPS} currentIndex={step} />
      {saved ? <Note tone="success" title="Draft saved">Nothing has been sent to a buyer. Your draft is at {STEPS[step]?.label.toLowerCase()}.</Note> : null}

      {step === 0 ? (
        <Panel title="What is the watch?" description="Use the reference from the case back or papers where you have it." id="new-details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <TextField label="Brand" value={brand} onChange={setBrand} required />
            <TextField label="Model" value={model} onChange={setModel} required />
            <TextField label="Reference" value={reference} onChange={setReference} hint="An unknown reference is allowed." />
            <TextField label="Year" value={year} onChange={setYear} inputMode="numeric" />
            <TextField label="Case size (mm)" value={caseSize} onChange={setCaseSize} inputMode="numeric" />
            <TextField label="Movement" value={movement} onChange={setMovement} />
          </div>
        </Panel>
      ) : null}

      {step === 1 ? (
        <Panel title="Condition record" description="Write what you can see. “I don’t know” is a better answer than a guess." id="new-condition">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
            Overall condition
            <select
              value={overall}
              onChange={(event) => setOverall(event.target.value)}
              style={{ minHeight: '44px', padding: '8px 10px', border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, font: 'inherit' }}
            >
              <option>Excellent</option>
              <option>Very good</option>
              <option>Good</option>
              <option>Fair</option>
              <option>For parts</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
            Marks and notes
            <textarea
              value={conditionNotes}
              onChange={(event) => setConditionNotes(event.target.value)}
              rows={4}
              style={{ padding: '8px 10px', border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, font: 'inherit' }}
            />
          </label>
          <fieldset style={{ border: `1px solid ${raw.color.ink100}`, borderRadius: raw.radius.md, padding: raw.space.s3 }}>
            <legend style={{ fontSize: '0.875rem', fontWeight: 600 }}>What is included</legend>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: '44px' }}>
              <input type="checkbox" checked={box} onChange={(event) => setBox(event.target.checked)} /> Original box
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: '44px' }}>
              <input type="checkbox" checked={papers} onChange={(event) => setPapers(event.target.checked)} /> Papers or warranty card
            </label>
          </fieldset>
        </Panel>
      ) : null}

      {step === 2 ? (
        <Panel
          title="Photographs"
          description="Daylight, straight on, no filters. Required photographs are what a buyer uses to decide."
          id="new-photos"
        >
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {REQUIRED_PHOTOS.map((photo) => (
              <li key={photo.id}>
                <label
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: 10,
                    alignItems: 'start',
                    minHeight: '44px',
                    padding: raw.space.s2,
                    border: `1px solid ${photos[photo.id] ? raw.color.ink100 : raw.color.signalCaution}`,
                    borderRadius: raw.radius.md,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={photos[photo.id]}
                    onChange={() => togglePhoto(photo.id)}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong style={{ fontSize: '0.9rem' }}>{photo.label}</strong>
                    <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>{photo.hint}</span>
                    <span style={{ color: photos[photo.id] ? raw.color.signalPositive : raw.color.signalCaution, fontSize: '0.8125rem' }}>
                      {photos[photo.id] ? 'Added' : 'Still needed'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Note tone={photosComplete ? 'success' : 'caution'} title={photosComplete ? 'All required photographs are in' : 'Required photographs are missing'}>
            A 3D capture is optional. It never replaces these photographs; it adds a rotating view of the same item.
          </Note>
        </Panel>
      ) : null}

      {step === 3 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', alignItems: 'start' }}>
          <Panel title="Price and buyer view" description="The buyer pays this amount. Your success fee is shown below." id="new-price">
            <TextField
              label="Asking price (rand)"
              value={price}
              onChange={setPrice}
              inputMode="numeric"
              hint="Whole rand or cents, for example 6800 or 6800.50."
              {...(priceValid ? {} : { error: 'Enter a price above R0.' })}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.8125rem', color: tokens.text.secondary }}>Buyer sees</span>
              <strong style={{ fontSize: '1.5rem' }}>{formatCents(priceValid ? priceCents : 0)}</strong>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', margin: 0, fontSize: '0.9rem' }}>
              <dt>Seller success fee</dt>
              <dd style={{ margin: 0, textAlign: 'right' }}>{sellerFeePercentLabel()}</dd>
              <dt>You receive when the order completes</dt>
              <dd style={{ margin: 0, textAlign: 'right' }}>{formatCents(priceValid ? priceCents : 0)}</dd>
            </dl>
            <Note title="What the buyer is told">
              {brand} {model}, {year}. {overall.toLowerCase()} condition. {box ? 'Box included.' : 'No box.'}{' '}
              {papers ? 'Papers included.' : 'No papers.'} The written condition record and photographs are the description.
            </Note>
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Panel title="Optional 3D capture" id="new-capture">
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55 }}>
                A capture costs <MoneyText value={CAPTURE_PRICE} /> once and shows the watch from 360 frames. Your seller fee
                stays {sellerFeePercentLabel()}. The capture pays for itself on items above{' '}
                <MoneyText value={CAPTURE_BREAK_EVEN} />.
              </p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minHeight: '44px' }}>
                <input
                  type="checkbox"
                  checked={captureBooked}
                  onChange={(event) => setCaptureBooked(event.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Book a capture job at the Cape Town studio.
                  <span style={{ display: 'block', color: tokens.text.secondary, fontSize: '0.8125rem' }}>
                    You pay <MoneyText value={CAPTURE_PRICE} /> after the studio accepts the booking. Nothing is charged now.
                  </span>
                </span>
              </label>
              <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
                Booking status: {captureBooked ? 'Requested — the studio confirms within one working day.' : 'No capture job booked.'}
              </p>
            </Panel>

            <Panel title="Publish" id="new-publish">
              {published === null ? (
                <>
                  <button type="button" disabled={!canPublish} onClick={() => setPublished('photos')}>
                    Publish with photographs only
                  </button>
                  <button type="button" disabled={!canPublishCapture} onClick={() => setPublished('capture')}>
                    Publish with 3D preview
                  </button>
                  {!photosComplete ? <Note tone="caution">Add the remaining required photographs before publishing.</Note> : null}
                  {!priceValid ? <Note tone="caution">Enter an asking price above R0.</Note> : null}
                  {photosComplete && priceValid && !captureBooked ? (
                    <Note tone="caution" title="A 3D listing needs a capture job">
                      The 3D preview cannot be published without a booked capture. Book one above, or publish with photographs
                      only — both are real listings.
                    </Note>
                  ) : null}
                </>
              ) : (
                <Note tone="success" title={published === 'capture' ? 'Submitted with a 3D capture' : 'Submitted for review'}>
                  {published === 'capture'
                    ? 'Your capture request and listing are with the studio and a reviewer. We will show their progress on your dashboard.'
                    : 'A reviewer checks the photographs and condition record, usually under four working hours. The listing is not visible to buyers until it passes.'}
                </Note>
              )}
            </Panel>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}>
            Continue to {STEPS[step + 1]?.label.toLowerCase()}
          </button>
        ) : (
          <a href="/listings" className="button secondary">
            Back to my listings
          </a>
        )}
      </div>
    </div>
  );
}

/** Exported for tests: the same conversion the form uses, so a price is never rounded in two places. */
export function randsToCents(value: string): number {
  return parseRandsToCents(value);
}
