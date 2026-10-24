import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import Queue from '../routes/Queue.js';
import ListingReview from '../routes/ListingReview.js';
import { tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('review queue', () => {
  it('renders the waiting listings with money, seller and service level', () => {
    const view = render(<Queue route={tableRoute('/')} />);
    expect(view.getByRole('heading', { level: 1, name: 'Review queue' })).toBeTruthy();
    expect(view.getByText('lst_2026_0481')).toBeTruthy();
    expect(view.getByText('@capevintage_co')).toBeTruthy();
    expect(view.getByText('R4,850')).toBeTruthy();
    expect(view.getByText('6h overdue')).toBeTruthy();
  });

  it('links each row to its listing review and never claims a model proves authenticity', () => {
    const view = render(<Queue route={tableRoute('/')} />);
    const link = view.getByRole('link', { name: '1994 Seiko SKX007 diver, full set' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/listings/lst_2026_0481');
    expect(document.body.textContent).toContain('not evidence of authenticity');
  });
});

describe('listing review', () => {
  it('refuses a takedown until evidence is reviewed and a reason is written', () => {
    const view = render(<ListingReview route={tableRoute('/listings/:id')} />);
    const takedown = view.getByRole('button', { name: 'Take down listing' }) as HTMLButtonElement;
    expect(takedown.disabled).toBe(true);
    expect(view.getByText(/Confirm that you reviewed the listing evidence/)).toBeTruthy();

    fireEvent.input(view.getByLabelText('Reason for takedown'), {
      target: { value: 'The photographs reuse a stock image.' },
    });
    expect(takedown.disabled).toBe(true);

    fireEvent.click(view.getByLabelText(/I have reviewed the photographs/));
    expect(takedown.disabled).toBe(false);
  });

  it('shows the evidence and the seller record without payment credentials', () => {
    const view = render(<ListingReview route={tableRoute('/listings/:id')} />);
    expect(view.getByText('@thandos_attic')).toBeTruthy();
    expect(view.getByText('Price against category median')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(password|otp|card number|account number|secret)\b/i);
  });
});
