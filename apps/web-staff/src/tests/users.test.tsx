import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import Users from '../routes/Users.js';
import { tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('accounts', () => {
  it('lists buyers and sellers with their verification tier', () => {
    const view = render(<Users route={tableRoute('/users')} />);
    expect(view.getByRole('heading', { level: 1, name: 'Accounts' })).toBeTruthy();
    expect(view.getByText('@quick_cash_cpt')).toBeTruthy();
    expect(view.getAllByText('Under review').length).toBeGreaterThan(0);
    expect(view.getAllByText('T5').length).toBeGreaterThan(0);
  });

  it('masks the payout destination and refuses sanctions without a reason', () => {
    const view = render(<Users route={tableRoute('/users')} />);
    expect(view.getAllByText(/FNB •••• 4821/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\b\d{10,}\b/);

    const record = view.getByRole('button', { name: 'Record account action' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);

    fireEvent.change(view.getByLabelText('Action'), { target: { value: 'suspend' } });
    fireEvent.input(view.getByLabelText('Reason'), {
      target: { value: 'Repeated destination changes and unpaid refunds.' },
    });
    expect(record.disabled).toBe(true);

    fireEvent.click(view.getByLabelText(/I understand the account holder/));
    expect(record.disabled).toBe(false);
  });

  it('names the capability a sanction needs', () => {
    render(<Users route={tableRoute('/users')} />);
    expect(document.body.textContent).toContain('account.sanction');
    expect(document.body.textContent).toContain('Reading this screen needs account.view');
  });
});
