import { describe, it, expect, afterEach } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConditionSeverity } from '../api/item-transport.js';
import type { ConditionRecord } from '../api/item-transport.js';
import { SeverityChip } from '../condition/severity-chip.js';
import { DisclosureRecord } from '../condition/disclosure-record.js';
import { ConditionList } from '../condition/condition-list.js';
import { fixtureDetail } from '../api/fixtures.js';

const SEVERITIES: ConditionSeverity[] = ['cosmetic', 'functional', 'unknown'];

const realWarn = console.warn;
afterEach(() => {
  console.warn = realWarn;
});

const record: ConditionRecord = {
  disclosureId: 'dis_test',
  text: 'Second hand sweeps, then jumps back at 6. The seller calls it normal; nobody has opened it.',
  severity: 'functional',
  location: 'movement',
};

describe('SeverityChip', () => {
  it('renders a data-severity attribute for each of the three contract severities', () => {
    for (const severity of SEVERITIES) {
      const markup = renderToStaticMarkup(<SeverityChip severity={severity} />);
      expect(markup).toContain(`data-severity="${severity}"`);
      expect(markup).toContain('<span');
      expect(markup).not.toBe('');
    }
  });

  it('never renders a check-style word — severity classifies the declaration, not the item', () => {
    for (const severity of SEVERITIES) {
      const markup = renderToStaticMarkup(<SeverityChip severity={severity} />).toLowerCase();
      for (const banned of ['verified', 'guaranteed', 'certified', 'approved', '✓']) {
        expect(markup).not.toContain(banned);
      }
    }
  });

  it('refuses a severity outside the contract union: nothing renders and the dev warning names it', () => {
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);
    const bogus = 'structural' as unknown as ConditionSeverity;
    expect(renderToStaticMarkup(<SeverityChip severity={bogus} />)).toBe('');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('structural');
  });
});

describe('DisclosureRecord', () => {
  it('shows the record id — the handle a dispute quotes — alongside text, location and severity', () => {
    const markup = renderToStaticMarkup(<DisclosureRecord record={record} />);
    expect(markup).toContain('dis_test');
    expect(markup).toContain('movement');
    expect(markup).toContain('jumps back at 6');
    expect(markup).toContain('data-severity="functional"');
  });
});

describe('ConditionList', () => {
  const presage = fixtureDetail('lst_01')!;

  it('renders every declared record, nothing more and nothing less', () => {
    const markup = renderToStaticMarkup(<ConditionList records={presage.conditionRecords} />);
    for (const r of presage.conditionRecords) {
      expect(markup).toContain(r.disclosureId);
      expect(markup).toContain(r.text);
    }
    expect(markup.match(/item-disclosure-record/g)).toHaveLength(presage.conditionRecords.length);
    expect(markup).toContain(`${presage.conditionRecords.length} declared records`);
  });

  it('escapes HTML in seller text rather than rendering it (disclosures are user input)', () => {
    const hostile: ConditionRecord = { ...record, text: '<img src=x onerror=alert(1)>' };
    const markup = renderToStaticMarkup(<ConditionList records={[hostile]} />);
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('&lt;img');
  });

  it('a listing with zero declarations says so as a statement, not as a blank', () => {
    const markup = renderToStaticMarkup(<ConditionList records={[]} />);
    expect(markup).toContain('data-variant="no-declared-faults"');
    expect(markup).toContain('declared nothing wrong');
  });

  it('the section states that the text — not the photos — is what a dispute reads', () => {
    const markup = renderToStaticMarkup(<ConditionList records={[record]} />);
    expect(markup).toContain('what a dispute is judged on');
  });
});
