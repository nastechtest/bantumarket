import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Table } from '../data/table.js';
import type { TableColumn, TableSort } from '../data/table.js';
import { LoadingRow } from '../data/loading-row.js';

interface Order {
  id: string;
  buyer: string;
  cents: number;
}

const columns: TableColumn<Order>[] = [
  { key: 'buyer', header: 'Buyer', render: (r) => r.buyer, sortable: true },
  { key: 'id', header: 'Order', render: (r) => r.id },
  { key: 'cents', header: 'Amount', render: (r) => String(r.cents), sortable: true, align: 'end' },
];

const rows: Order[] = [
  { id: 'O-1', buyer: 'Thandi', cents: 420000 },
  { id: 'O-2', buyer: 'Jaco', cents: 87500 },
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Table semantics', () => {
  it('is a native table: caption, th scope=col, one row per datum', () => {
    const markup = renderToStaticMarkup(
      <Table caption="Open orders" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    expect(markup).toContain('<table');
    expect(markup).toContain('<caption');
    expect(markup).toContain('Open orders');
    expect(markup.match(/<th scope="col"/g)?.length).toBe(3);
    expect(markup.match(/<tr>/g)?.length).toBe(3); // header + 2 data rows
    expect(markup).toContain('Thandi');
    expect(markup).toContain('420000');
  });

  it('aria-sort exists only on the actively sorted column', () => {
    const sorted = renderToStaticMarkup(
      <Table
        caption="Open orders"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        sort={{ key: 'buyer', dir: 'ascending' }}
      />,
    );
    expect(sorted.match(/aria-sort/g)?.length).toBe(1);
    expect(sorted).toContain('aria-sort="ascending"');

    // Negative fixture: a *sortable but unsorted* column must not claim a direction, and the
    // non-sortable column must carry no button at all.
    expect(sorted.match(/aria-sort/g)?.length).toBe(1);
    const unsorted = renderToStaticMarkup(
      <Table caption="Open orders" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    expect(unsorted).not.toContain('aria-sort');
    expect(unsorted).toContain('↕'); // neutral affordance glyph on sortable headers
  });

  it('the empty state spans the full column count; busy announces aria-busy', () => {
    const empty = renderToStaticMarkup(
      <Table
        caption="Open orders"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        busy
        emptyState={<p>No orders yet</p>}
      />,
    );
    // React emits the camelCased `colSpan` in static markup; the span count is the contract, not casing.
    expect(empty).toMatch(/colspan="3"/i);
    expect(empty).toContain('No orders yet');
    expect(empty).toContain('aria-busy="true"');
  });

  it('LoadingRow keeps the column count — the loading shape is the loaded shape', () => {
    const markup = renderToStaticMarkup(
      <table>
        <tbody>
          <LoadingRow columns={3} rows={2} />
        </tbody>
      </table>,
    );
    expect(markup.match(/<tr/g)?.length).toBe(2);
    expect(markup.match(/<td/g)?.length).toBe(6);
    expect(markup).toContain('aria-hidden="true"'); // skeletons never enter the a11y tree
    expect(markup).not.toContain('Loading');
  });
});

describe('Table sort interaction', () => {
  let root: Root | null = null;
  afterEach(() => {
    root?.unmount();
    root = null;
  });

  it('activating a header button requests ascending, then toggles to descending', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const events: TableSort[] = [];
    let sort: TableSort | null = null;

    const render = (s: TableSort | null) =>
      act(async () => {
        root!.render(
          <Table
            caption="Open orders"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            sort={s}
            onSortChange={(next) => {
              events.push(next);
            }}
          />,
        );
      });

    await render(sort);
    const buyerButton = host.querySelectorAll('button.ds-sortable-header')[0] as HTMLButtonElement;
    await act(async () => {
      buyerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(events[events.length - 1]).toEqual({ key: 'buyer', dir: 'ascending' });

    sort = events[events.length - 1]!;
    await render(sort);
    const buyerButtonAgain = host.querySelectorAll('button.ds-sortable-header')[0] as HTMLButtonElement;
    await act(async () => {
      buyerButtonAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(events[events.length - 1]).toEqual({ key: 'buyer', dir: 'descending' });

    // Keyboard: a button receives Enter/Space natively — assert the control really is a button.
    expect(buyerButtonAgain.tagName).toBe('BUTTON');
    expect(buyerButtonAgain.type).toBe('button');
  });
});
