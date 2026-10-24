import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import CaptureOps from '../routes/CaptureOps.js';
import CaptureQc from '../routes/CaptureQc.js';
import { tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('capture programme', () => {
  it('shows the studio schedule and flags failed intake', () => {
    const view = render(<CaptureOps route={tableRoute('/capture-ops')} />);
    expect(view.getByRole('heading', { level: 1, name: 'Capture programme' })).toBeTruthy();
    expect(view.getByText('cap_2026_0918')).toBeTruthy();
    expect(view.getAllByText(/Braamfontein studio/).length).toBeGreaterThan(0);
    expect(view.getByText('Failed')).toBeTruthy();
  });

  it('keeps the two-person rule visible for high-value items', () => {
    render(<CaptureOps route={tableRoute('/capture-ops')} />);
    expect(document.body.textContent).toContain('two-person rule');
    expect(document.body.textContent).toContain('second person must be named on');
  });
});

describe('capture QC', () => {
  it('keeps the pass control closed until every required check is complete', () => {
    const view = render(<CaptureQc route={tableRoute('/listings/:id/capture')} />);
    const pass = view.getByRole('button', { name: 'Pass capture QC' }) as HTMLButtonElement;
    expect(pass.disabled).toBe(true);
    expect(view.getByText('Complete every required check before passing this rendition.')).toBeTruthy();

    const checks = view.getAllByRole('checkbox');
    expect(checks.length).toBe(5);
    for (const check of checks) fireEvent.click(check);
    expect(pass.disabled).toBe(false);
  });

  it('states the claim scope and shows the rendition hashes', () => {
    const view = render(<CaptureQc route={tableRoute('/listings/:id/capture')} />);
    expect(view.getByText(/Outer condition only/)).toBeTruthy();
    expect(view.getByText('9f2c41a8')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(password|otp|card number|account number)\b/i);
  });
});
