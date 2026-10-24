import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import Disputes from '../routes/Disputes.js';
import DisputeCase from '../routes/DisputeCase.js';
import { tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('disputes', () => {
  it('lists the held amounts and links every case to its own file', () => {
    const view = render(<Disputes route={tableRoute('/disputes')} />);
    expect(view.getByRole('heading', { level: 1, name: 'Disputes' })).toBeTruthy();
    expect(view.getAllByText('R18,500').length).toBeGreaterThan(0);
    const link = view.getByRole('link', { name: 'Item not as described' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/disputes/dsp_2026_3310');
    expect(view.getByText('ord_2026_88421')).toBeTruthy();
  });

  it('shows only handles and references, never a payment credential', () => {
    render(<Disputes route={tableRoute('/disputes')} />);
    expect(document.body.textContent).not.toMatch(/\b(password|otp|card number|account number|secret)\b/i);
    expect(document.body.textContent).toContain('last four digits');
  });
});

describe('dispute case', () => {
  it('keeps the decision control closed until an outcome, a reason and review are recorded', () => {
    const view = render(<DisputeCase route={tableRoute('/disputes/:id')} />);
    const record = view.getByRole('button', { name: 'Record decision' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);
    expect(view.getByText('Choose an outcome first.')).toBeTruthy();

    fireEvent.change(view.getByLabelText('Outcome'), { target: { value: 'partial' } });
    expect(record.disabled).toBe(true);

    fireEvent.input(view.getByLabelText('Reason for the decision'), {
      target: { value: 'Movement serial falls outside the stated year.' },
    });
    expect(record.disabled).toBe(true);

    fireEvent.click(view.getByLabelText(/I have read both sides/));
    expect(record.disabled).toBe(false);
  });

  it('renders both sides of the evidence and the held amount', () => {
    const view = render(<DisputeCase route={tableRoute('/disputes/:id')} />);
    expect(view.getByText('dsp_2026_3310')).toBeTruthy();
    expect(view.getAllByText('R18,500').length).toBeGreaterThan(0);
    expect(view.getByText(/movement serial is outside the 1972 range/)).toBeTruthy();
    expect(view.getByText(/Held funds:/)).toBeTruthy();
  });
});
