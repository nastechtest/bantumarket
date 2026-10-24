import '../../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MfaStep, isMfaCodeValid } from './mfa-step.js';

afterEach(cleanup);

describe('MFA step', () => {
  it('accepts only six digits as a code', () => {
    expect(isMfaCodeValid('418205')).toBe(true);
    expect(isMfaCodeValid('41820')).toBe(false);
    expect(isMfaCodeValid('4182055')).toBe(false);
    expect(isMfaCodeValid('41820a')).toBe(false);
  });

  it('keeps Continue disabled until a whole code is typed, with the reason visible', () => {
    const view = render(<MfaStep challengeId="chal_1" onSubmit={() => undefined} />);
    const continueButton = (): HTMLButtonElement => view.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(continueButton().disabled).toBe(true);
    expect(view.getByText(/Enter the 6-digit code/)).toBeTruthy();

    fireEvent.input(view.getByLabelText('6-digit code'), { target: { value: '4182' } });
    expect(continueButton().disabled).toBe(true);

    fireEvent.input(view.getByLabelText('6-digit code'), { target: { value: '418205' } });
    expect(continueButton().disabled).toBe(false);
    expect(view.queryByText(/Enter the 6-digit code/)).toBeNull();
  });

  it('submits the code and has no skip path', async () => {
    const submitted: string[] = [];
    const view = render(<MfaStep challengeId="chal_1" onSubmit={(code) => { submitted.push(code); }} />);
    expect(view.queryByText(/skip/i)).toBeNull();
    fireEvent.input(view.getByLabelText('6-digit code'), { target: { value: '418205' } });
    fireEvent.click(view.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(submitted).toEqual(['418205']));
  });

  it('renders a rejection without offering to bypass it', () => {
    const view = render(<MfaStep challengeId="chal_1" onSubmit={() => undefined} error="That code was not accepted." />);
    expect(view.getByText('That code was not accepted.')).toBeTruthy();
    expect(view.queryByText(/continue without/i)).toBeNull();
  });

  it('requests a fresh challenge and says the old code stops working', async () => {
    let resent = 0;
    const view = render(<MfaStep challengeId="chal_1" onSubmit={() => undefined} onResend={() => { resent += 1; }} />);
    fireEvent.click(view.getByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(resent).toBe(1));
    expect(await view.findByText(/previous code no longer works/)).toBeTruthy();
  });
});
