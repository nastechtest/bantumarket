/**
 * Catalogue integrity: the promises `events.ts` makes about itself, checked against the data.
 *
 * The compiler already holds two of them — `EVENTS` is annotated as a mapped type over
 * `EventPropsMap`, so a missing event or an undeclared prop is a type error. What a type cannot hold
 * is the half that matters commercially: that every event named in the brief is actually present and
 * spelled as the brief spells it, that a row states one purpose in one line, that `required` and
 * `optional` together are exactly the declared props, and that no row is categorised into a kind of
 * processing the pilot has decided not to do. Those are data claims, so they are tested as data.
 */
import { describe, expect, it } from 'bun:test';
import { ORDER_STATES as CONTRACT_ORDER_STATES } from '@nastech/api-contracts';
import {
  definitionOf,
  categoryOf,
  EVENT_NAMES,
  EVENTS,
  ORDER_STATES,
  REQUIRED_EVENT_NAMES,
  ROUTE_CLASSES,
  STATIC_FALLBACK_REASONS,
  type EventName,
  type PropSpec,
} from '../events.js';
import { CONSENT_CATEGORIES, DECISION_CATEGORIES, NEVER_COLLECTED } from '../../../lib/consent/types.js';

const KEYS = Object.keys(EVENTS) as EventName[];

function propsOf(name: EventName): string[] {
  return Object.keys(EVENTS[name].props as Record<string, PropSpec>);
}

describe('the catalogue is the measurement plan the brief signed off', () => {
  it('names every event the brief requires, spelled exactly', () => {
    const absent = REQUIRED_EVENT_NAMES.filter((name) => !EVENT_NAMES.includes(name));
    expect(absent).toEqual([]);
    // Each required row is the one the funnel needs; a rename here silently breaks an exit test in 04.
    expect([...REQUIRED_EVENT_NAMES].sort()).toEqual(
      ['checkout_started', 'dispute_raised', 'handover_confirmed', 'handover_scheduled', 'inspect_opened', 'inspect_static_fallback_shown', 'listing_viewed', 'payment_confirmed', 'scene_budget_refused', 'search_performed'],
    );
    expect(EVENT_NAMES.length).toBeGreaterThanOrEqual(REQUIRED_EVENT_NAMES.length);
    expect(EVENT_NAMES.length).toBe(21);
  });

  it('never lists an event twice under two spellings', () => {
    expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
    expect(new Set(KEYS).size).toBe(EVENT_NAMES.length);
  });

  it('each entry describes itself: the key, the name and the category all agree', () => {
    for (const name of KEYS) {
      const definition = definitionOf(name);
      expect(definition.name).toBe(name);
      expect(EVENTS[name]).toBe(definition);
      expect(categoryOf(name)).toBe(definition.category);
      expect(CONSENT_CATEGORIES).toContain(definition.category);
    }
  });

  it('every row states one purpose, on one line, long enough to be a question', () => {
    for (const name of KEYS) {
      const purpose = EVENTS[name].purpose;
      expect(purpose.length, `${name} has no purpose`).toBeGreaterThan(40);
      expect(purpose).toBe(purpose.trim());
      // One line, because this string ends up in a consent notice and a README table; a multi-paragraph
      // purpose is a sign the event answers more than one question and should be two events.
      expect(purpose).not.toMatch(/[\n\r]/);
    }
  });

  it('required and optional partition the declared props exactly', () => {
    for (const name of KEYS) {
      const definition = EVENTS[name];
      const declared = propsOf(name);
      const listed = [...definition.required, ...definition.optional];
      expect(new Set(listed).size, `${name} lists a prop twice`).toBe(listed.length);
      expect([...definition.required].sort()).toEqual(
        [...definition.required].filter((p) => declared.includes(p)).sort(),
      );
      expect([...listed].sort()).toEqual([...declared].sort());
      for (const prop of definition.required) {
        expect(definition.optional).not.toContain(prop);
      }
    }
  });

  it('a per-event refusal never contradicts the catalogue that declares the prop', () => {
    for (const name of KEYS) {
      const declared = propsOf(name);
      for (const forbidden of EVENTS[name].forbidden) {
        // `forbidden` is documentation with a test behind it: if the catalogue declared one of these
        // names, the row would be collecting the thing its own note says it must not.
        expect(declared, `${name} declares ${forbidden}, which it also forbids`).not.toContain(forbidden);
      }
      expect(EVENTS[name].forbidden.length).toBeGreaterThan(0);
    }
  });

  it('nothing is categorised as marketing, which the pilot does not process', () => {
    // NEVER_COLLECTED is a decision, not a preference: a `marketing` row would be a record of
    // permission to do something there is no basis for.
    for (const category of NEVER_COLLECTED) {
      expect(EVENT_NAMES.filter((n) => categoryOf(n) === category)).toEqual([]);
    }
    const essential = EVENT_NAMES.filter((n) => categoryOf(n) === 'essential');
    expect(essential.sort()).toEqual(['consent_recorded', 'session_rotated']);
    for (const name of EVENT_NAMES) {
      const category = categoryOf(name);
      if (category === 'essential') continue;
      expect(DECISION_CATEGORIES, `${name} has category ${category}`).toContain(category);
    }
  });
});

describe('the vocabularies are contracts, not copies', () => {
  it('the order ladder is the ledger\'s own, by identity', () => {
    // Re-declaring the ladder here would let an analytics row name a state the ledger cannot reach.
    // `toBe` on the array is reference equality, so this fails the day someone types the list again.
    expect(ORDER_STATES).toBe(CONTRACT_ORDER_STATES);
    expect([...ORDER_STATES]).toContain('PAID');
    expect(new Set(ORDER_STATES).size).toBe(ORDER_STATES.length);
  });

  it('the route classes mirror the router and nothing else', () => {
    expect([...ROUTE_CLASSES].sort()).toEqual(['brand', 'critical', 'first-paint', 'scene']);
  });

  it('a static-path reason names a cause, never "some other reason"', () => {
    expect(STATIC_FALLBACK_REASONS.length).toBeGreaterThan(3);
    expect(new Set(STATIC_FALLBACK_REASONS).size).toBe(STATIC_FALLBACK_REASONS.length);
    for (const reason of STATIC_FALLBACK_REASONS) {
      expect(reason).not.toMatch(/\s/);
      expect(['other', 'unknown', 'misc']).not.toContain(reason);
    }
  });
});
