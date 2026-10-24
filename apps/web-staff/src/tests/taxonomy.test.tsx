import '../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import Taxonomy from '../routes/Taxonomy.js';
import { tableRoute } from './fixtures.js';

afterEach(cleanup);

describe('catalogue taxonomy', () => {
  it('lists the category tree and the pending changes', () => {
    const view = render(<Taxonomy route={tableRoute('/taxonomy')} />);
    expect(view.getByRole('heading', { level: 1, name: 'Catalogue' })).toBeTruthy();
    expect(view.getByText('Watches › Sports')).toBeTruthy();
    expect(view.getByText(/Merge “Watches › Sports” into/)).toBeTruthy();
    expect(view.getByText('watches-divers')).toBeTruthy();
  });

  it('refuses a merge until a surviving category, reason and attribute check are supplied', () => {
    const view = render(<Taxonomy route={tableRoute('/taxonomy')} />);
    const merge = view.getByRole('button', { name: 'Merge categories' }) as HTMLButtonElement;
    expect(merge.disabled).toBe(true);
    expect(view.getByText('Choose the surviving category first.')).toBeTruthy();

    fireEvent.change(view.getByLabelText('Merge into'), { target: { value: 'cat_watches_divers' } });
    expect(merge.disabled).toBe(true);

    fireEvent.input(view.getByLabelText('Reason'), {
      target: { value: 'Sports and divers overlap; sellers pick one tree.' },
    });
    expect(merge.disabled).toBe(true);

    fireEvent.click(view.getByLabelText(/I have checked that the surviving category/));
    expect(merge.disabled).toBe(false);
  });
});
