import { describe, expect, it } from 'bun:test';
import './dom-setup.js';
import { ListingsPage } from '../features/listings/listings-page.js';
import { ListingDetailPage } from '../features/listings/listing-detail-page.js';
import { NewListingPage } from '../features/listings/new-listing-page.js';
import { CapturePreviewPage } from '../features/listings/capture-preview-page.js';
import { pathParam } from '../lib/path-param.js';
import { click, mount, textOf } from './mount.js';

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  if (button === undefined) throw new Error(`no button containing "${label}"`);
  return button as HTMLButtonElement;
}

function checkboxFor(container: HTMLElement, label: string): HTMLInputElement {
  const wrapper = [...container.querySelectorAll('label')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  const input = wrapper?.querySelector('input[type="checkbox"]');
  if (!(input instanceof HTMLInputElement)) throw new Error(`no checkbox for "${label}"`);
  return input;
}

describe('my listings', () => {
  it('shows real listings with money formatted from cents and a live capture state', async () => {
    const mounted = mount(<ListingsPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('My listings');
    expect(body).toContain('Tudor Black Bay 58, navy bezel');
    expect(body).toContain('R42,500');
    expect(body).toContain('3D in review');
    expect(body).not.toContain('4250000');
    mounted.unmount();
  });

  it('filters to drafts without losing the other listings from the data', async () => {
    const mounted = mount(<ListingsPage />);
    await click(buttonByText(mounted.container, 'Drafts'));
    const body = textOf(mounted.container);
    expect(body).toContain('Seiko Presage Cocktail Time');
    expect(body).not.toContain('Omega Seamaster 300M, 2019');
    mounted.unmount();
  });
});

describe('listing detail', () => {
  it('shows the condition record, review owner and the seller economics', async () => {
    const mounted = mount(<ListingDetailPage listingId="lst_1002" />);
    const body = textOf(mounted.container);
    expect(body).toContain('Tudor Black Bay 58, navy bezel');
    expect(body).toContain('79030B');
    expect(body).toContain('With a NasTech reviewer');
    expect(body).toContain('Bezel hairline at 2 o’clock');
    expect(body).toContain('0%');
    expect(body).toContain('R42,500');
    mounted.unmount();
  });

  it('never renders a made-up listing for an unknown id', async () => {
    const mounted = mount(<ListingDetailPage listingId="lst_missing" />);
    expect(textOf(mounted.container)).toContain('Listing not found');
    expect(textOf(mounted.container)).toContain('Back to my listings');
    mounted.unmount();
  });
});

describe('new listing wizard', () => {
  it('refuses a 3D publish until a capture job is booked, while photo-only stays available', async () => {
    const mounted = mount(<NewListingPage />);

    await click(buttonByText(mounted.container, 'Continue to condition'));
    await click(buttonByText(mounted.container, 'Continue to photographs'));
    await click(checkboxFor(mounted.container, 'Clasp or buckle'));
    await click(buttonByText(mounted.container, 'Continue to price and publish'));

    const threeD = buttonByText(mounted.container, 'Publish with 3D preview');
    expect(threeD.disabled).toBe(true);
    expect(textOf(mounted.container)).toContain('A 3D listing needs a capture job');
    expect(textOf(mounted.container)).toContain('R270');
    expect(buttonByText(mounted.container, 'Publish with photographs only').disabled).toBe(false);

    await click(checkboxFor(mounted.container, 'Book a capture job'));
    expect(buttonByText(mounted.container, 'Publish with 3D preview').disabled).toBe(false);
    mounted.unmount();
  });

  it('prices the buyer view through the money formatter, not raw cents', async () => {
    const mounted = mount(<NewListingPage />);
    await click(buttonByText(mounted.container, 'Continue to condition'));
    await click(buttonByText(mounted.container, 'Continue to photographs'));
    await click(checkboxFor(mounted.container, 'Clasp or buckle'));
    await click(buttonByText(mounted.container, 'Continue to price and publish'));
    expect(textOf(mounted.container)).toContain('R6,800');
    expect(textOf(mounted.container)).toContain('0%');
    mounted.unmount();
  });
});

describe('capture review', () => {
  it('shows the physical checklist, QC state and the real capture economics', async () => {
    const mounted = mount(<CapturePreviewPage listingId="lst_1002" />);
    const body = textOf(mounted.container);
    expect(body).toContain('Capture review');
    expect(body).toContain('Turntable calibrated');
    expect(body).toContain('Reference object in frame');
    expect(body).toContain('360 frames captured');
    expect(body).toContain('With a reviewer');
    expect(body).toContain('360 / 360');
    expect(body).toContain('R270');
    expect(body).toContain('0%');
    expect(body).toContain('R2,700');
    expect(body).toContain('R270 per capture, 0% seller fee, break-even R2,700');
    mounted.unmount();
  });

  it('explains the claim scope rather than implying the capture proves how the watch runs', async () => {
    const mounted = mount(<CapturePreviewPage listingId="lst_1002" />);
    const body = textOf(mounted.container);
    expect(body).toContain('does not show how it runs');
    expect(body).toContain('shape and outer condition');
    mounted.unmount();
  });
});

describe('route parameter parsing', () => {
  it('resolves one named segment and ignores a query string', () => {
    expect(pathParam('/listings/:id/capture', 'id', '/listings/lst_1002/capture?from=dashboard')).toBe('lst_1002');
    expect(pathParam('/listings/:id', 'id', '/listings')).toBeNull();
  });
});
