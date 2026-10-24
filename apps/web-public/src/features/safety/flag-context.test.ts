import { describe, it, expect } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FlagProvider,
  SUBJECT_KIND_LABELS,
  SUBJECT_KIND_ORDER,
  defaultSubjectCatalogue,
  describeSubject,
  useFlagSubject,
  REPORT_FLOW_PATH,
} from './flag-context.js';
import { fixtureSubjects } from './api/fixtures.js';
import { SAFETY_SECTIONS } from './index.js';
import type { ReportSubject } from './api/safety-transport.js';

/**
 * The flag context in four properties: the vocabulary is complete, the catalogue is one-per-kind,
 * the provider/hook wiring actually carries a subject to a consumer, and a report affordance on
 * any surface has exactly one path to land on.
 */

function Probe() {
  const subject = useFlagSubject();
  return createElement('span', null, subject ? describeSubject(subject) : 'no subject in context');
}

describe('subject vocabulary', () => {
  it('names all four reportable surfaces with words that fit a picker', () => {
    expect([...SUBJECT_KIND_ORDER].sort()).toEqual(['handover', 'item', 'order', 'seller']);
    for (const kind of SUBJECT_KIND_ORDER) {
      expect(SUBJECT_KIND_LABELS[kind]).toBeTruthy();
    }
  });

  it('describeSubject puts the kind before the label — a picker scan reads “what, then which”', () => {
    expect(describeSubject(fixtureSubjects.item)).toBe(
      'A listing — Seiko “Presage” automatic, 40.5 mm — R4,200',
    );
    expect(describeSubject(fixtureSubjects.order)).toContain('An order — Order ORD-7741');
  });
});

describe('catalogue', () => {
  it('offers exactly one default subject per kind, matching the fixtures', () => {
    const catalogue = defaultSubjectCatalogue();
    expect(catalogue).toHaveLength(4);
    const ids = catalogue.map((s) => `${s.kind}:${s.id}`);
    for (const kind of SUBJECT_KIND_ORDER) {
      const fixture = fixtureSubjects[kind] as ReportSubject;
      expect(ids).toContain(`${kind}:${fixture.id}`);
    }
  });
});

describe('provider wiring', () => {
  it('a consumer under FlagProvider reads the subject the source page set', () => {
    const markup = renderToStaticMarkup(
      createElement(FlagProvider, { subject: fixtureSubjects.handover, children: createElement(Probe) }),
    );
    expect(markup).toContain('A scheduled handover —');
    expect(markup).toContain('ORD-9002');
  });

  it('without a provider the hook resolves to null and the flow starts un-prefilled', () => {
    const markup = renderToStaticMarkup(createElement(Probe));
    expect(markup).toContain('no subject in context');
  });

  it('a provider carrying null is explicit “nothing was flagged”, not a missing provider', () => {
    const markup = renderToStaticMarkup(
      createElement(FlagProvider, { subject: null, children: createElement(Probe) }),
    );
    expect(markup).toContain('no subject in context');
  });
});

describe('routing', () => {
  it('REPORT_FLOW_PATH is a real section of this feature — the hub links what the flag button opens', () => {
    expect(SAFETY_SECTIONS.map((s) => s.path)).toContain(REPORT_FLOW_PATH);
  });
});
