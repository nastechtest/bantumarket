import { describe, expect, it } from 'bun:test';
import { mount, flush, byTestId, typeInto } from '../features/auth/test-dom.js';
import { DataRequestPage } from '../features/account/index.js';

/**
 * The POPIA form's two real behaviours: it refuses an incomplete request, and a complete request
 * gets a reference without ever claiming that data left the device.
 */

async function submit(container: HTMLElement): Promise<void> {
  const form = container.querySelector('form');
  if (form === null) throw new Error('data-request form is missing');
  await flush(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('/account/data-request', () => {
  it('refuses an empty request with field-specific errors and no receipt', async () => {
    const m = mount(<DataRequestPage />);
    await m.flush();
    expect(m.container.querySelector('[data-testid="data-request-page"]')).not.toBeNull();

    await submit(m.container);
    const errors = byTestId(m.container, 'data-request-errors');
    expect(errors.textContent).toContain('Give the name');
    expect(errors.textContent).toContain('email address or phone number');
    expect(m.container.querySelector('[data-testid="data-request-receipt"]')).toBeNull();
    m.unmount();
  });

  it('prepares a referenced request and says plainly that nothing was sent', async () => {
    const m = mount(<DataRequestPage />);
    await m.flush();
    const inputs = [...m.container.querySelectorAll('input[type="text"]')] as HTMLInputElement[];
    expect(inputs.length).toBe(2);
    await typeInto(inputs[0]!, 'Thabo Mokoena');
    await typeInto(inputs[1]!, 'thabo@example.co.za');

    await submit(m.container);
    const receipt = byTestId(m.container, 'data-request-receipt');
    expect(receipt.textContent).toContain('POPIA-');
    expect(receipt.textContent).toContain('Thabo Mokoena');
    expect(receipt.textContent).toContain('Nothing has been sent');
    m.unmount();
  });
});
