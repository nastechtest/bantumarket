import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ConsoleFrame } from '../layout/console-frame.js';
import Reconciliation from '../routes/Reconciliation.js';
import { NOW, tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('reconciliation refusal', () => {
  it('refuses an anonymous visitor and never renders the ledger breaks', () => {
    const route = tableRoute('/reconciliation');
    const view = render(
      <ConsoleFrame route={route} session={null} now={NOW}>
        <Reconciliation route={route} />
      </ConsoleFrame>,
    );
    expect(view.getByRole('heading', { level: 1, name: 'Sign in to use the console' })).toBeTruthy();
    expect(view.queryByRole('heading', { level: 1, name: 'Reconciliation' })).toBeNull();
    expect(document.body.textContent).not.toContain('brk_2026_7741');
  });
});

describe('reconciliation breaks', () => {
  it('shows expected, captured and signed variance for each break', () => {
    const view = render(<Reconciliation route={tableRoute('/reconciliation')} />);
    expect(view.getByText('brk_2026_7741')).toBeTruthy();
    expect(view.getByText('R7,200')).toBeTruthy();
    expect(view.getByText('-R200')).toBeTruthy();
    expect(view.getByText('-R2,615')).toBeTruthy();
  });

  it('refuses an export until the reason and confirmation are supplied', () => {
    const view = render(<Reconciliation route={tableRoute('/reconciliation')} />);
    const exportButton = view.getByRole('button', { name: 'Export breaks (CSV)' }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    expect(view.getByText('Confirm the export is for reconciliation only.')).toBeTruthy();

    fireEvent.input(view.getByLabelText('Reason for the export'), {
      target: { value: 'Month-end check with the finance checker.' },
    });
    expect(exportButton.disabled).toBe(true);

    fireEvent.click(view.getByLabelText(/I confirm this export is for reconciliation only/));
    expect(exportButton.disabled).toBe(false);
  });
});
