import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { ConsoleFrame } from '../layout/console-frame.js';
import Audit from '../routes/Audit.js';
import { NOW, tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('audit refusal', () => {
  it('refuses an anonymous visitor before any audit row is rendered', () => {
    const route = tableRoute('/audit');
    const view = render(
      <ConsoleFrame route={route} session={null} now={NOW}>
        <Audit route={route} />
      </ConsoleFrame>,
    );
    expect(view.getByRole('heading', { level: 1, name: 'Sign in to use the console' })).toBeTruthy();
    expect(view.queryByRole('heading', { level: 1, name: 'Audit trail' })).toBeNull();
    expect(document.body.textContent).not.toContain('aud_2026_99012');
  });
});

describe('audit trail', () => {
  it('records who acted, why and when for every entry', () => {
    const view = render(<Audit route={tableRoute('/audit')} />);
    expect(view.getByText('Naledi Khumalo')).toBeTruthy();
    expect(view.getAllByText('finance_checker').length).toBeGreaterThan(0);
    expect(view.getByText('22 Oct 2026, 08:42 UTC')).toBeTruthy();
    expect(view.getByText('Second checker release after bank details were verified')).toBeTruthy();
    expect(view.getByText('denied')).toBeTruthy();
  });

  it('keeps secrets out of the audit rows themselves', () => {
    const view = render(<Audit route={tableRoute('/audit')} />);
    const table = view.getByRole('table');
    expect(table.textContent).not.toMatch(/\b(password|otp|one[- ]time code|card number|account number|secret)\b/i);
    expect(table.textContent).toContain('Refused: preparer and releaser were the same operator');
  });
});
