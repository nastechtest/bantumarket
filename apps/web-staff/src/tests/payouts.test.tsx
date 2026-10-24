import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ConsoleFrame } from '../layout/console-frame.js';
import PayoutOps from '../routes/PayoutOps.js';
import { NOW, tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('payout ops refusal', () => {
  it('refuses an anonymous visitor without rendering the payout screen', () => {
    const route = tableRoute('/payouts');
    const view = render(
      <ConsoleFrame route={route} session={null} now={NOW}>
        <PayoutOps route={route} />
      </ConsoleFrame>,
    );
    expect(view.getByRole('heading', { level: 1, name: 'Sign in to use the console' })).toBeTruthy();
    expect(view.queryByRole('heading', { level: 1, name: 'Payout ops' })).toBeNull();
    expect(document.body.textContent).not.toContain('pay_2026_1042');
  });
});

describe('payout batch release', () => {
  it('refuses the preparer as their own second approver', () => {
    const view = render(<PayoutOps route={tableRoute('/payouts')} />);
    const release = view.getByRole('button', { name: 'Release batch' }) as HTMLButtonElement;
    expect(release.disabled).toBe(true);

    fireEvent.change(view.getByLabelText('Second approver'), { target: { value: 'lindiwe' } });
    expect(view.getByText('The preparer cannot release this batch')).toBeTruthy();
    expect(release.disabled).toBe(true);

    fireEvent.change(view.getByLabelText('Second approver'), { target: { value: 'naledi' } });
    fireEvent.click(view.getByLabelText(/I have checked the destination/));
    expect(release.disabled).toBe(false);
  });

  it('masks the destination and never prints a full account number', () => {
    const view = render(<PayoutOps route={tableRoute('/payouts')} />);
    expect(view.getAllByText(/FNB •••• 4821/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\b\d{10,}\b/);
    expect(document.body.textContent).toContain('preparer and approver are the same account');
  });
});
