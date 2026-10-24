import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import RiskCases from '../routes/RiskCases.js';
import RiskCase from '../routes/RiskCase.js';
import { tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('risk cases', () => {
  it('lists the signals and links a case to its detail', () => {
    const view = render(<RiskCases route={tableRoute('/risk')} />);
    expect(view.getByRole('heading', { level: 1, name: 'Risk cases' })).toBeTruthy();
    expect(view.getByText('14 listings in 24h')).toBeTruthy();
    const link = view.getByRole('link', { name: '@sandton_time' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/risk/rsk_2026_5512');
    expect(view.getByText('82')).toBeTruthy();
  });

  it('says a score opens a case rather than freezing an account', () => {
    render(<RiskCases route={tableRoute('/risk')} />);
    expect(document.body.textContent).toContain('A high score opens a case');
    expect(document.body.textContent).toContain('not freeze an account by itself');
  });
});

describe('risk case', () => {
  it('masks the payout destination and refuses an account action without a reason', () => {
    const view = render(<RiskCase route={tableRoute('/risk/:caseId')} />);
    expect(view.getAllByText(/FNB •••• 4821/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\b\d{10,}\b/);

    const record = view.getByRole('button', { name: 'Record account action' }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);

    fireEvent.change(view.getByLabelText('Action'), { target: { value: 'hold' } });
    fireEvent.input(view.getByLabelText('Reason'), {
      target: { value: 'Beneficiary name differs from the account holder.' },
    });
    expect(record.disabled).toBe(true);

    fireEvent.click(view.getByLabelText(/I understand the account holder/));
    expect(record.disabled).toBe(false);
  });

  it('shows the linked orders and the hold already placed', () => {
    const view = render(<RiskCase route={tableRoute('/risk/:caseId')} />);
    expect(view.getByText('ord_2026_88421')).toBeTruthy();
    expect(view.getByText('Disputed — funds held')).toBeTruthy();
    expect(view.getByText('Hold placed')).toBeTruthy();
  });
});
