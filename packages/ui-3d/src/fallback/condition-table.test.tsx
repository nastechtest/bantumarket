import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { ConditionTable, SEVERITY_ORDER, orderCaptions } from './condition-table.js';
import { caption } from './test-fixtures.js';
import { createRenderHarness, teardownHarness, type RenderHarness } from './test-dom.js';

let h: RenderHarness;
beforeAll(async () => {
  h = await createRenderHarness();
});
afterEach(() => h.reset());
afterAll(() => teardownHarness());

describe('orderCaptions', () => {
  it('puts unknown severity first, because that is the one the buyer cannot check', () => {
    const ordered = orderCaptions([
      caption('hs_case', 'cosmetic', 'Light swirl marks on the case back.'),
      caption('hs_crystal', 'unknown', 'Crystal replaced by the previous owner; not verified by us.'),
      caption('hs_crown', 'functional', 'Crown wends but sticks near full wind.'),
    ]);
    expect(ordered.map((c) => c.severity)).toEqual(['unknown', 'functional', 'cosmetic']);
  });

  it('is a total order with no stable-sort dependence on input order', () => {
    const a = [caption('x1', 'cosmetic', 'a'), caption('x0', 'unknown', 'b')];
    const b = [caption('x0', 'unknown', 'b'), caption('x1', 'cosmetic', 'a')];
    expect(orderCaptions(a).map((c) => c.disclosureId)).toEqual(orderCaptions(b).map((c) => c.disclosureId));
  });

  it('breaks ties on the disclosure record so the reading order is reproducible in a dispute', () => {
    const ordered = orderCaptions([
      caption('h3', 'cosmetic', 'c', 'dis_03'),
      caption('h1', 'cosmetic', 'a', 'dis_01'),
      caption('h2', 'cosmetic', 'b', 'dis_02'),
    ]);
    expect(ordered.map((c) => c.disclosureId)).toEqual(['dis_01', 'dis_02', 'dis_03']);
  });

  it('does not mutate the manifest captions it was handed', () => {
    const input = [caption('a', 'cosmetic', 'x'), caption('b', 'unknown', 'y')];
    orderCaptions(input);
    expect(input.map((c) => c.severity)).toEqual(['cosmetic', 'unknown']);
  });

  it('orders the declared severity vocabulary with unknown at the head', () => {
    expect(SEVERITY_ORDER[0]).toBe('unknown');
  });
});

describe('ConditionTable', () => {
  it('renders every disclosure as text, keyed to its record', () => {
    const captions = [
      caption('hs_bezel', 'cosmetic', 'One hairline at 2 o’clock on the bezel.', 'dis_01'),
      caption('hs_crystal', 'unknown', 'Crystal replaced by the previous owner.', 'dis_02'),
    ];
    const { container } = h.render(<ConditionTable captions={captions} listingId="lst_01" />);
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('data-severity')).toBe('unknown');
    expect(rows[0]!.textContent).toContain('Crystal replaced by the previous owner.');
    expect(rows[0]!.textContent).toContain('dis_02');
    expect(rows[1]!.textContent).toContain('One hairline at 2 o’clock on the bezel.');
  });

  it('renders with no images and no canvas — the artefact must survive a dead network', () => {
    const { container } = h.render(<ConditionTable captions={[caption('h', 'functional', 'Crown sticks.')]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('says so explicitly when nothing was disclosed, rather than rendering an empty hole', () => {
    const { container } = h.render(<ConditionTable captions={[]} />);
    expect(container.querySelector('.nt-condition__summary')!.textContent).toContain('No condition notes were recorded');
    expect(container.querySelector('table')).toBeNull();
  });

  it('counts the unresolved items in the summary the buyer reads first', () => {
    const { container } = h.render(
      <ConditionTable
        captions={[caption('a', 'unknown', 'x'), caption('b', 'unknown', 'y'), caption('c', 'cosmetic', 'z')]}
      />,
    );
    expect(container.querySelector('.nt-condition__summary')!.textContent).toContain('2 of them unresolved');
  });
});
