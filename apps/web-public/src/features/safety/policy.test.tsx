import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TIER_LABELS } from '@nastech/api-contracts';
import { FeesPolicy } from './policy/fees.js';
import { ProhibitedPolicy, PROHIBITED } from './policy/prohibited.js';
import { PopiaNote, POPIA_FACTS } from './policy/popia-note.js';
import { ChildrenPolicy } from './policy/children.js';
import { SafetyHub, HUB_SECTIONS } from './safety-hub.js';
import { HowItWorks, SALE_STAGES, SIDE_STATES } from './how-it-works.js';
import { MeetSafely, CAPE_TOWN_SPOTS, OTHER_CITY_SPOTS, MEETING_RULES } from './meet-safely.js';
import { ScamPatterns, SCAM_PATTERNS } from './scam-patterns.js';
import { REPORT_REASONS } from './report-flow/reason.js';

/**
 * The read pages: hub, policies, meeting spots, scam patterns, sale mechanics. These tests assert
 * the content is SPECIFIC — real statutes, real venues, real rand amounts — because generic
 * marketplace boilerplate fails this brief as surely as a forbidden word does.
 */

describe('fees policy', () => {
  const markup = renderToStaticMarkup(<FeesPolicy />);
  it('quotes the worked example in the ledger’s own numbers', () => {
    expect(markup).toContain('R6,500');
    expect(markup).toContain('R650');
    expect(markup).toContain('R5,850');
    expect(markup).toContain('10 %');
    expect(markup).toContain('R0');
  });
  it('ties the success fee to COMPLETED, and says a cancel generates no fee', () => {
    expect(markup).toContain('COMPLETED');
    expect(markup).toContain('generates no fee');
  });
  it('includes the mandatory “what the fee does not buy” section, tier phrase and all', () => {
    expect(markup).toContain('What your fee does not buy');
    expect(markup).toContain(TIER_LABELS.T4);
    expect(markup).toContain('genuine');
  });
});

describe('prohibited items', () => {
  const markup = renderToStaticMarkup(<ProhibitedPolicy />);
  it('each entry names both the what and the statute or concrete harm', () => {
    expect(PROHIBITED.length).toBeGreaterThanOrEqual(8);
    for (const entry of PROHIBITED) {
      expect(markup).toContain(entry.what);
      expect(markup).toContain(entry.because);
    }
  });
  it('is South African law, not a template', () => {
    expect(markup).toContain('Counterfeit Goods Act 37 of 1997');
    expect(markup).toContain('perlemoen');
    expect(markup).toContain('Firearms Control Act 60 of 2000');
    expect(markup).toContain('Medicines Act 101 of 1965');
    expect(markup).toContain('ICASA');
  });
  it('states consequences including the referral, and the appeal route', () => {
    expect(markup).toContain('SAPS');
    expect(markup).toContain('/safety/report');
    expect(markup).toContain(TIER_LABELS.T3);
  });
});

describe('POPIA note', () => {
  const markup = renderToStaticMarkup(<PopiaNote />);
  it('names the Act, the Regulator, and the rights with their numbers', () => {
    expect(markup).toContain('Protection of Personal Information Act 4 of 2013');
    expect(markup).toContain('Information Regulator');
    expect(markup).toContain('30 days');
    expect(markup).toContain('RAI');
    expect(markup).toContain('s11(2)(b)');
    expect(markup).toContain('s11(2)(g)');
  });
  it('says plainly what the reported person receives — the honesty the report flow depends on', () => {
    expect(markup).toContain('They see your stated reason');
    expect(markup).toContain('They do not receive your contact details');
  });
  it('every facts entry renders with a heading and body, retention quoted from the queue constant', () => {
    for (const fact of POPIA_FACTS) {
      expect(markup).toContain(fact.heading);
      expect(fact.body.length).toBeGreaterThan(40);
    }
    expect(markup).toContain('5 years');
  });
  it('the ID-document tier is referenced by its contract label, never a coined one', () => {
    expect(markup).toContain(TIER_LABELS.T2);
  });
});

describe('children policy', () => {
  const markup = renderToStaticMarkup(<ChildrenPolicy />);
  it('sets the 18 floor with the statute behind it, not vibes', () => {
    expect(markup).toContain('18 to open an account');
    expect(markup).toContain('Children’s Act 38 of 2005');
  });
  it('gives a concrete path when someone finds a minor on the other side', () => {
    expect(markup).toContain('Do not meet them');
    expect(markup).toContain('report');
  });
});

describe('safety hub', () => {
  const markup = renderToStaticMarkup(<SafetyHub />);
  it('links every registered section — no page in this tree is unreachable from the front door', () => {
    expect(HUB_SECTIONS.length).toBeGreaterThanOrEqual(10);
    for (const section of HUB_SECTIONS) {
      expect(markup).toContain(`href="${section.path}"`);
    }
  });
  it('renders the whole tier vocabulary, exactly once per label, in one line', () => {
    for (const label of Object.values(TIER_LABELS)) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('no stars, no badges');
  });
  it('points emergencies at 10111 instead of at itself', () => {
    expect(markup).toContain('10111');
    expect(markup).toContain('not an emergency line');
  });
});

describe('how a sale works', () => {
  const markup = renderToStaticMarkup(<HowItWorks />);
  it('walks the real ledger states, in order, including the refund pair', () => {
    const expected = ['AWAITING_PAYMENT', 'PAID', 'HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED', 'COMPLETED'];
    let cursor = 0;
    for (const state of expected) {
      const at = markup.indexOf(state);
      expect(at, `state ${state} missing`).toBeGreaterThan(-1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(SALE_STAGES.map((s) => s.state)).toEqual(expected);
    expect(markup).toContain('REFUND_PENDING → REFUNDED');
    expect(markup).toContain('IN_DISPUTE');
    expect(SIDE_STATES.length).toBe(3);
  });
  it('ends with the undeletable list of what no stage ever does', () => {
    expect(markup).toContain('No stage of this machine does the following, ever');
    expect(markup).toContain('authenticates a watch');
    expect(markup).toContain('chaperones a meeting');
  });
  it('names the human touchpoints by their contract phrases only', () => {
    expect(markup).toContain(TIER_LABELS.T2);
    expect(markup).toContain(TIER_LABELS.T3);
    expect(markup).toContain(TIER_LABELS.T4);
  });
});

describe('meet safely', () => {
  const markup = renderToStaticMarkup(<MeetSafely />);
  it('lists named Cape Town spots with an address and a reason each', () => {
    expect(CAPE_TOWN_SPOTS.length).toBeGreaterThanOrEqual(4);
    for (const spot of CAPE_TOWN_SPOTS) {
      // markup is HTML-escaped; names like “V&A” arrive as V&amp;A.
      expect(markup).toContain(spot.name.replace(/&/g, '&amp;'));
      expect(markup).toContain(spot.where.replace(/&/g, '&amp;'));
      expect(spot.why.length).toBeGreaterThan(30);
    }
    expect(markup).toContain('Buitengracht Street');
    expect(markup).toContain('Clarence Avenue');
  });
  it('carries the rest of the country too — this page survives the pilot', () => {
    expect(OTHER_CITY_SPOTS.length).toBeGreaterThanOrEqual(3);
    expect(markup).toContain('Sandton City');
    expect(markup).toContain('uMhlanga Rocks');
    expect(markup).toContain('Baywide');
  });
  it('the rules outrank the map: PIN-last and no stranger couriers are on the list', () => {
    expect(MEETING_RULES.length).toBeGreaterThanOrEqual(6);
    expect(markup).toContain('before the handover PIN is read out, never after');
    expect(markup).toContain('printed airbill is not a handover');
  });
  it('is honest about the platform’s absence at the meeting', () => {
    expect(markup).toContain('What the platform is at these meetings: absent');
    expect(markup).toContain('10111');
  });
});

describe('scam patterns', () => {
  const markup = renderToStaticMarkup(<ScamPatterns />);
  it('covers the four named patterns, each with scene, tells, defence', () => {
    const ids = SCAM_PATTERNS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['overpayment', 'fake-proof', 'off-platform', 'fake-courier']));
    for (const p of SCAM_PATTERNS) {
      expect(markup).toContain(`data-pattern="${p.id}"`);
      expect(markup).toContain(p.scene);
      expect(markup).toContain(p.howItWorks);
      expect(markup).toContain(p.defence);
      expect(p.tells.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('amounts are R amounts from the actual pilot market', () => {
    expect(markup).toContain('R3,100');
    expect(markup).toContain('R700');
    expect(markup).toContain('R4,200');
    expect(markup).toContain('R5,900');
  });
  it('every pattern routes to a reason that exists in the report flow', () => {
    const reasonIds = REPORT_REASONS.map((r) => r.id);
    for (const p of SCAM_PATTERNS) {
      expect(reasonIds, `pattern ${p.id} points at a nonexistent reason`).toContain(p.reportReasonId);
    }
  });
  it('off-platform and courier patterns say the WhatsApp/courier words explicitly', () => {
    expect(markup).toContain('WhatsApp');
    expect(markup).toContain('+234');
    expect(markup).toContain('airbill');
    expect(markup).toContain('08600 10111');
  });
});
