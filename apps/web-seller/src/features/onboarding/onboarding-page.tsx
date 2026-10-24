import { MoneyText, Stepper } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { CAPTURE_BREAK_EVEN, CAPTURE_PRICE, sellerFeePercentLabel } from '../../lib/pricing.js';
import { Note, Panel, Stat } from '../../ui/primitives.js';

const STEPS = [
  { label: 'Seller details' },
  { label: 'ID check' },
  { label: 'Bank account' },
  { label: 'First listing' },
  { label: 'Handover ready' },
] as const;

const REQUIREMENTS = [
  {
    title: 'The watch itself',
    body: 'Brand, model and reference where you know them. “I don’t know” is an allowed answer and better than a guess.',
  },
  {
    title: 'Three daylight photographs',
    body: 'Dial, case back and every mark you disclose. We strip the location before a photograph is stored.',
  },
  {
    title: 'An asking price',
    body: 'You can change it in a draft. The buyer pays the price on the listing, and the money is held until handover.',
  },
  {
    title: 'A written condition record',
    body: 'The marks, the box, the papers and the service history. This record is what support reads if a buyer disputes a mark.',
  },
] as const;

export function OnboardingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Get started"
        eyebrow="Seller onboarding"
        description="Three steps are done. The next one is a real listing; the dashboard will keep showing what is left."
      >
        <a className="button" href="/listings/new">
          Start your first listing
        </a>
      </PageHeader>

      <Stepper steps={STEPS} currentIndex={3} />

      <Panel title="Your progress" description="A step is done when it is done on our side, not when you click a button." id="onboarding-progress">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
          <Stat label="Account" value="Ready" detail="Seller details saved." />
          <Stat label="ID check" value="ID checked" detail="Tier 2 — this is what buyers see." />
          <Stat label="Payouts" value="FNB •••• 4821" detail="Confirmed 22 Sep 2026." />
          <Stat label="Listings" value="0 live" detail="Your first listing starts the next step." />
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Panel title="What you need before the first listing" description="About 12 minutes, and you can stop after any step." id="onboarding-requirements">
          <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {REQUIREMENTS.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <p style={{ margin: '2px 0 0', color: tokens.text.secondary, fontSize: '0.87rem', lineHeight: 1.5 }}>{item.body}</p>
              </li>
            ))}
          </ol>
          <Note>
            Listing is free. A review checks the photographs and the condition record before buyers see it; usually under four
            working hours.
          </Note>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Panel title="The 3D capture is optional" id="onboarding-capture">
            <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55 }}>
              A capture costs <MoneyText value={CAPTURE_PRICE} /> per item and shows the watch from 360 frames on a calibrated
              turntable. The seller fee stays {sellerFeePercentLabel()}. At that fee, a capture pays for itself once an item
              clears <MoneyText value={CAPTURE_BREAK_EVEN} />.
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.875rem' }}>
              <li>Turntable calibrated against a 50 mm reference bar.</li>
              <li>360 frames; automatic checks for focus, lighting and occlusion.</li>
              <li>A reviewer compares the frames with your condition record.</li>
            </ul>
            <Note>
              A capture evidences shape and outer condition only. It does not show how the watch runs or whether it is authentic.
              Photographs alone are a complete listing.
            </Note>
            <a href="/listings/lst_1002/capture">See a capture review</a>
          </Panel>

          <Panel title="How the money works" id="onboarding-money">
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.9rem' }}>
              <li>Buyer pays; NasTech holds the money.</li>
              <li>You meet in a public place and both confirm the handover with a PIN.</li>
              <li>The money becomes payable on the next payout run.</li>
              <li>A dispute keeps the money held while support reads both records.</li>
            </ol>
            <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.84rem' }}>
              Your seller fee is {sellerFeePercentLabel()}. Bank details and payout dates live on the payouts screen.
            </p>
            <a href="/payouts">Open payouts</a>
          </Panel>
        </div>
      </div>

      <section
        aria-labelledby="onboarding-next-title"
        style={{
          background: tokens.surface.primary,
          border: `1px solid ${raw.color.ink100}`,
          borderLeft: `4px solid ${raw.color.accent600}`,
          borderRadius: raw.radius.lg,
          padding: raw.space.s5,
          display: 'flex',
          flexDirection: 'column',
          gap: raw.space.s2,
        }}
      >
        <h2 id="onboarding-next-title" style={{ fontSize: '1.2rem' }}>
          Your next step: list one watch
        </h2>
        <p style={{ margin: 0, color: tokens.text.secondary, lineHeight: 1.55 }}>
          Start with the watch you know best. Photographs and an honest condition record are enough; a 3D capture can be added
          later from the listing.
        </p>
        <div>
          <a className="button" href="/listings/new">
            Start a listing
          </a>
        </div>
      </section>
    </div>
  );
}
