import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import PopiaRequests from '../routes/PopiaRequests.js';
import { tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('POPIA requests', () => {
  it('shows the erasure and retention decision side by side', () => {
    const view = render(<PopiaRequests route={tableRoute('/requests')} />);
    expect(view.getByRole('heading', { level: 1, name: 'POPIA requests' })).toBeTruthy();
    expect(view.getByText('Erasure versus retention')).toBeTruthy();
    expect(view.getAllByText('Erase').length).toBeGreaterThan(0);
    expect(view.getAllByText('Retain').length).toBeGreaterThan(0);
    expect(view.getByText('FICA and Tax Administration Act')).toBeTruthy();
  });

  it('refuses a full erasure grant where a retention duty applies', () => {
    const view = render(<PopiaRequests route={tableRoute('/requests')} />);
    fireEvent.change(view.getByLabelText('Outcome'), { target: { value: 'grant' } });
    expect(view.getByText('A full grant is not available')).toBeTruthy();
    expect(document.body.textContent).toContain('statutory retention duty');
  });

  it('will not record the decision without a reason and legal basis', () => {
    const view = render(<PopiaRequests route={tableRoute('/requests')} />);
    const record = view.getByRole('button', { name: 'Record POPIA decision' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);

    fireEvent.change(view.getByLabelText('Outcome'), { target: { value: 'partial' } });
    expect(record.disabled).toBe(true);

    fireEvent.input(view.getByLabelText('Reason and legal basis'), {
      target: { value: 'Financial records retained for five years under FICA.' },
    });
    expect(record.disabled).toBe(false);
  });
});
