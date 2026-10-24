import './test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useCursorPage } from './use-cursor-page.js';
import { resetOnlineForTests, setOnline } from './connectivity.js';
import type { CursorPage } from './cursor.js';

afterEach(() => {
  cleanup();
  resetOnlineForTests();
});

const pages: Record<string, CursorPage<number>> = {
  '': { rows: [1, 2], nextCursor: 'k1.c2', scanned: 2 },
  'k1.c2': { rows: [3], nextCursor: null, scanned: 1 },
};

const fetcher = async (cursor: string | null): Promise<CursorPage<number>> =>
  pages[cursor ?? ''] ?? { rows: [], nextCursor: null, scanned: 0 };

function Probe() {
  const page = useCursorPage(fetcher);
  return (
    <div>
      <span data-testid="status">{page.status}</span>
      <span data-testid="rows">{page.rows.join(',')}</span>
      <span data-testid="scanned">{page.scanned}</span>
      <span data-testid="error">{page.error ?? ''}</span>
      <button type="button" onClick={page.previous} disabled={!page.canPrevious}>previous</button>
      <button type="button" onClick={page.next} disabled={page.nextCursor === null}>next</button>
      <button type="button" onClick={page.reload}>reload</button>
    </div>
  );
}

describe('useCursorPage', () => {
  it('loads the first page, then appends the page behind the cursor and can go back', async () => {
    const view = render(<Probe />);
    await waitFor(() => expect(view.getByTestId('status').textContent).toBe('ready'));
    expect(view.getByTestId('rows').textContent).toBe('1,2');
    expect(view.getByTestId('scanned').textContent).toBe('2');

    fireEvent.click(view.getByText('next'));
    await waitFor(() => expect(view.getByTestId('rows').textContent).toBe('3'));
    expect((view.getByText('next') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(view.getByText('previous'));
    await waitFor(() => expect(view.getByTestId('rows').textContent).toBe('1,2'));
  });

  it('shows an error state without pretending the table is empty', async () => {
    const failing = async (): Promise<CursorPage<number>> => {
      throw new Error('The queue did not answer.');
    };
    function Broken() {
      const page = useCursorPage(failing);
      return <span data-testid="status">{page.status}:{page.error}</span>;
    }
    const view = render(<Broken />);
    await waitFor(() => expect(view.getByTestId('status').textContent).toBe('error:The queue did not answer.'));
  });

  it('refuses to fetch while offline and says so', async () => {
    let calls = 0;
    const counting = async (): Promise<CursorPage<number>> => {
      calls += 1;
      return { rows: [], nextCursor: null, scanned: 0 };
    };
    setOnline(false);
    function Offline() {
      const page = useCursorPage(counting);
      return <span data-testid="status">{page.status}</span>;
    }
    const view = render(<Offline />);
    await waitFor(() => expect(view.getByTestId('status').textContent).toBe('offline'));
    expect(calls).toBe(0);
  });
});
