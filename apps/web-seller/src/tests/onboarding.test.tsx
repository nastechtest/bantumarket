import { describe, expect, it } from 'bun:test';
import './dom-setup.js';
import { OnboardingPage } from '../features/onboarding/onboarding-page.js';
import { NotFoundPage } from '../features/not-found/not-found-page.js';
import { mount, textOf } from './mount.js';

describe('get started', () => {
  it('shows the real onboarding status and the first-listing requirements', async () => {
    const mounted = mount(<OnboardingPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('Get started');
    expect(body).toContain('ID checked');
    expect(body).toContain('First listing');
    expect(body).toContain('The watch itself');
    expect(body).toContain('A written condition record');
    mounted.unmount();
  });

  it('shows the capture cost, the 0% fee and the break-even using the pricing helpers', async () => {
    const mounted = mount(<OnboardingPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('R270');
    expect(body).toContain('0%');
    expect(body).toContain('R2,700');
    expect(body).toContain('capture pays for itself');
    mounted.unmount();
  });

  it('offers the real next action without pretending the listing already exists', async () => {
    const mounted = mount(<OnboardingPage />);
    expect(textOf(mounted.container)).toContain('Your next step: list one watch');
    const start = mounted.container.querySelector('a[href="/listings/new"]');
    expect(start).not.toBeNull();
    mounted.unmount();
  });
});

describe('not found', () => {
  it('names the missing page and shows the requested path', async () => {
    const mounted = mount(<NotFoundPage path="/listings/lst_gone" />);
    const body = textOf(mounted.container);
    expect(body).toContain('That page is not here');
    expect(body).toContain('/listings/lst_gone');
    expect(body).toContain('Nothing has changed in your account');
    mounted.unmount();
  });

  it('offers real recovery destinations instead of a dead end', async () => {
    const mounted = mount(<NotFoundPage path="/orders/ord_gone" />);
    expect(mounted.container.querySelector('a[href="/"]')).not.toBeNull();
    expect(mounted.container.querySelector('a[href="/listings"]')).not.toBeNull();
    expect(mounted.container.querySelector('a[href="/orders"]')).not.toBeNull();
    expect(mounted.container.querySelector('a[href="/messages"]')).not.toBeNull();
    mounted.unmount();
  });
});
