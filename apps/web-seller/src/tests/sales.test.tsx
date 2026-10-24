import { describe, expect, it } from 'bun:test';
import './dom-setup.js';
import { SalesPage } from '../features/sales/sales-page.js';
import { SaleDetailPage } from '../features/sales/sale-detail-page.js';
import { click, mount, textOf } from './mount.js';

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  if (button === undefined) throw new Error(`no button containing "${label}"`);
  return button as HTMLButtonElement;
}

describe('sales list', () => {
  it('shows paid orders, held money and the buyer handle without raw cents', async () => {
    const mounted = mount(<SalesPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('Sales');
    expect(body).toContain('NTM-1042');
    expect(body).toContain('@nomsa.m');
    expect(body).toContain('Paid — schedule handover');
    expect(body).toContain('R42,500');
    expect(body).not.toContain('4250000');
    mounted.unmount();
  });

  it('filters to completed sales and keeps the disputed order out of that view', async () => {
    const mounted = mount(<SalesPage />);
    await click(buttonByText(mounted.container, 'Completed'));
    const body = textOf(mounted.container);
    expect(body).toContain('NTM-1010');
    expect(body).not.toContain('NTM-1042');
    expect(body).not.toContain('NTM-0995');
    mounted.unmount();
  });
});

describe('sale detail', () => {
  it('shows the ledger timeline, the 0% seller fee and the amount the seller receives', async () => {
    const mounted = mount(<SaleDetailPage saleId="ord_1042" />);
    const body = textOf(mounted.container);
    expect(body).toContain('NTM-1042');
    expect(body).toContain('Tissot PRX Powermatic 80');
    expect(body).toContain('Payment received');
    expect(body).toContain('Schedule the handover');
    expect(body).toContain('0%');
    expect(body).toContain('R4,200');
    mounted.unmount();
  });

  it('will not request a handover until both a date and a public place are chosen', async () => {
    const mounted = mount(<SaleDetailPage saleId="ord_1042" />);
    const request = buttonByText(mounted.container, 'Request this handover');
    expect(request.disabled).toBe(true);
    expect(textOf(mounted.container)).toContain('Both a date and a public place are needed');
    mounted.unmount();
  });

  it('shows a real dispute state with the held amount and no invented resolution', async () => {
    const mounted = mount(<SaleDetailPage saleId="ord_0995" />);
    const body = textOf(mounted.container);
    expect(body).toContain('This order is in dispute');
    expect(body).toContain('R64,500');
    expect(body).toContain('Support decision');
    mounted.unmount();
  });
});
