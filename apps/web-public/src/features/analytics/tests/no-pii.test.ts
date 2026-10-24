/**
 * The POPIA fence around the analytics catalogue, tested from both ends.
 *
 * `pii-guards.ts` and `schema.ts` are built to make a leak *unrepresentable* rather than discouraged:
 * a prop name on a forbidden list is refused, a money-shaped name may only be a bucket enum, an enum
 * member may not contain a space, and a numeric prop has to declare a unit that is not money. That is
 * a claim about data, so it is testable by walking the data — which is what most of this file does.
 *
 * The rest is the self-test: the taint fixtures in `fixtures.ts` are real-shaped South African PII (a
 * Joburg mobile, a Luhn-valid SA ID) and each has to be rejected by the code it names. Without those,
 * "zero issues across 21 events" could mean the detectors are broken rather than the catalogue clean.
 */
import { describe, expect, it } from 'bun:test';
import { money } from '@nastech/api-contracts';
import {
  EVENT_NAMES,
  EVENTS,
  refPropsOf,
  priceBucket,
  type EventName,
  type PropSpec,
} from '../events.js';
import { auditPropSpec, ALL_FORBIDDEN_NAMES, isValidProps, validateProps } from '../schema.js';
import {
  bucketPrice,
  isForbiddenName,
  isLuhnValid,
  isMoneyLikeName,
  PRICE_BUCKET_EDGES_CENTS,
  PRICE_BUCKETS,
  scanProps,
  scanValue,
} from '../pii-guards.js';
import { CLEAN_FIXTURES, fixtureRef, TAINTED_FIXTURES } from '../fixtures.js';

/** Every (event, prop, spec) triple in the catalogue, flattened so a rule can walk it once. */
const ALL_PROPS: readonly { name: EventName; prop: string; spec: PropSpec }[] = EVENT_NAMES.flatMap(
  (name) =>
    Object.entries(EVENTS[name].props as Record<string, PropSpec>).map(([prop, spec]) => ({ name, prop, spec })),
);

function codesOf(name: EventName, props: Record<string, unknown>): string[] {
  const result = validateProps(name, props);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('the catalogue declares nothing that could carry PII', () => {
  it('every prop of every event passes the declarative audit', () => {
    const issues = ALL_PROPS.flatMap(({ prop, spec }) => auditPropSpec(prop, spec).map((i) => `${prop}: ${i.code} ${i.message}`));
    expect(issues).toEqual([]);
  });

  it('no event declares a name on the forbidden list, exactly or by fragment', () => {
    const offenders = ALL_PROPS.filter(({ prop }) => isForbiddenName(prop).forbidden).map(({ name, prop }) => `${name}.${prop}`);
    expect(offenders).toEqual([]);
  });

  it('a money-shaped prop is always a bucket enum, never a number', () => {
    const moneyProps = ALL_PROPS.filter(({ prop }) => isMoneyLikeName(prop));
    expect(moneyProps.length).toBeGreaterThan(0);
    for (const { name, prop, spec } of moneyProps) {
      expect(spec.kind, `${name}.${prop} must be an enum`).toBe('enum');
      if (spec.kind === 'enum') {
        // The exact R value must not be expressible even as a string: an enum of literal prices would
        // be the same leak with an enum tag on it.
        expect(spec.values, `${name}.${prop} buckets`).toEqual([...PRICE_BUCKETS]);
      }
    }
  });

  it('no enum member is prose, and no vocabulary has a catch-all', () => {
    const SPACE = ALL_PROPS.filter(
      ({ spec }) => spec.kind === 'enum' && spec.values.some((v) => /\s/.test(v)),
    ).map(({ name, prop }) => `${name}.${prop}`);
    expect(SPACE).toEqual([]);

    const CATCH_ALL = /^(other|unknown|custom|misc|n\/a|free_text)$/i;
    const hatches = ALL_PROPS.filter(
      ({ spec }) => spec.kind === 'enum' && spec.values.some((v) => CATCH_ALL.test(v)),
    ).map(({ name, prop }) => `${name}.${prop}`);
    // A member like `other` is an open door: the caller can put anything in the sibling text prop, and
    // here there is no sibling text prop, so `other` would only ever collect a value nobody declared.
    expect(hatches).toEqual([]);

    for (const { name, prop, spec } of ALL_PROPS) {
      if (spec.kind !== 'enum') continue;
      expect(spec.values.length, `${name}.${prop} is empty`).toBeGreaterThan(0);
      expect(new Set(spec.values).size, `${name}.${prop} repeats a member}`).toBe(spec.values.length);
      for (const value of spec.values) {
        expect(value.length, `${name}.${prop}=${value} is too long to be a code`).toBeLessThanOrEqual(64);
      }
    }
  });

  it('every free-form string is a bounded slug and every ref a bounded length', () => {
    for (const { name, prop, spec } of ALL_PROPS) {
      if (spec.kind === 'slug') expect(spec.maxLength, `${name}.${prop} slug too long`).toBeLessThanOrEqual(64);
      if (spec.kind === 'ref') {
        expect(spec.length, `${name}.${prop} ref too short`).toBeGreaterThanOrEqual(16);
        expect(spec.length, `${name}.${prop} ref too long`).toBeLessThanOrEqual(32);
      }
      // There is no `string` kind in PropSpec at all: an unbounded string is not expressible, which is
      // the reason the two checks above can be bounds rather than a denylist.
      expect(['enum', 'slug', 'ref', 'boolean', 'count', 'ratio']).toContain(spec.kind);
    }
  });

  it('the only props allowed to look like a random id are refs', () => {
    for (const name of EVENT_NAMES) {
      const declared = Object.entries(EVENTS[name].props as Record<string, PropSpec>)
        .filter(([, spec]) => spec.kind === 'ref')
        .map(([prop]) => prop)
        .sort();
      expect([...refPropsOf(name)].sort()).toEqual(declared);
    }
  });

  it('the forbidden list is readable data and covers the POPIA-shaped names', () => {
    expect(ALL_FORBIDDEN_NAMES).toEqual([...ALL_FORBIDDEN_NAMES].sort());
    expect(new Set(ALL_FORBIDDEN_NAMES).size).toBe(ALL_FORBIDDEN_NAMES.length);
    for (const sample of ['email', 'phone', 'id_number', 'bank_account', 'pan', 'cvv', 'full_name', 'latitude', 'price_cents', 'query', 'listing_title', 'user_id', 'ip', 'token']) {
      expect(ALL_FORBIDDEN_NAMES, `forbidden list lost ${sample}`).toContain(sample);
    }
  });
});

describe('the detectors fire', () => {
  it('rejects every taint fixture with the code it names', () => {
    expect(TAINTED_FIXTURES.length).toBeGreaterThan(10);
    for (const taint of TAINTED_FIXTURES) {
      const result = validateProps(taint.name, taint.props);
      expect(result.ok, `${taint.label} was accepted`).toBe(false);
      if (!result.ok) {
        expect(result.issues.map((i) => i.code), `${taint.label} wrong code`).toContain(taint.expect);
      }
    }
  });

  it('catches a real SA mobile, a Luhn-valid SA ID and an email in a value', () => {
    expect(scanValue('note', '082 555 1234').map((h) => h.kind)).toContain('phone');
    expect(isLuhnValid('8701015800027')).toBe(true);
    expect(scanValue('note', '8701015800027').map((h) => h.kind)).toContain('national_id');
    expect(scanValue('note', 'thabiso.mokoena@example.co.za').map((h) => h.kind)).toContain('email');
    expect(scanValue('note', 'R2 700.00').map((h) => h.kind)).toContain('exact_price');
    // An ISO timestamp is 13 digits with separators; a detector that flags it would be switched off
    // within a sprint, so the false-positive pile is part of the rule.
    expect(scanValue('as_of', '2026-04-01T00:00:00.000Z')).toEqual([]);
  });

  it('the declarative audit rejects the four shapes it exists to reject', () => {
    // Without these, "zero issues across 21 events" would be indistinguishable from a broken auditor.
    const codesFor = (prop: string, spec: PropSpec) => auditPropSpec(prop, spec).map((i) => i.code);
    expect(codesFor('listing_title', { kind: 'slug', maxLength: 20 })).toContain('forbidden_name');
    expect(codesFor('fee_cents', { kind: 'count', unit: 'count', max: 1_000_000 })).toContain('money_unit');
    expect(codesFor('result_count_bucket', { kind: 'enum', values: ['Ten to twenty'] })).toContain('pii_value');
    expect(codesFor('seller_id', { kind: 'enum', values: ['usr_1'] })).toContain('forbidden_name');
    expect(codesFor('item_ref', { kind: 'ref', length: 8 })).toContain('bad_shape');
    expect(codesFor('category_slug', { kind: 'slug', maxLength: 512 })).toContain('bad_shape');
  });

  it('names the property as the leak even when its value is clean', () => {
    // `seller_email: ''` is not a leak of content; it is a field waiting for one, and the call site
    // that fills it in is the thing this list exists to stop.
    expect(scanProps({ seller_email: '' }).map((h) => h.path)).toEqual(['seller_email']);
    expect(scanProps({ price_cents: 0 }).length).toBe(1);
  });

  it('relaxes the digit-run rule only where the schema proved a value is a ref', () => {
    const digits = '012345678901234567890123'; // 24 digits: identifier-shaped, not a ref
    expect(scanValue('candidate', digits).map((h) => h.kind)).toContain('digit_run');
    expect(scanValue('candidate', digits, { skipDigitRun: true })).toEqual([]);
    // A real ref carries no long digit run anyway; the option exists so the rule cannot be bent by a
    // caller who declares `listing_ref` as a ref and then puts a phone number in it.
    const ref = fixtureRef('listing-a');
    expect(scanProps({ listing_ref: ref }, ['listing_ref'])).toEqual([]);
    expect(scanProps({ listing_ref: ref }).length).toBe(0);
  });
});

describe('the clean payloads are the other half of the proof', () => {
  it('every event has one legal payload that validates and scans clean', () => {
    for (const name of EVENT_NAMES) {
      const payload = CLEAN_FIXTURES[name];
      expect(isValidProps(name, payload), `${name} rejected its own fixture`).toBe(true);
      expect(scanProps(payload as Record<string, unknown>, refPropsOf(name)), `${name} leaked`).toEqual([]);
    }
  });

  it('a legal payload minus a required prop is refused, not silently trimmed', () => {
    const name: EventName = 'checkout_started';
    const required = EVENTS[name].required;
    expect(required.length).toBeGreaterThan(0);
    const stripped = { ...(CLEAN_FIXTURES[name] as Record<string, unknown>) };
    delete stripped[required[0] as string];
    expect(codesOf(name, stripped)).toContain('missing_required');
  });
});

describe('price buckets', () => {
  it('lose resolution on purpose and put the R270 break-even on a bucket edge', () => {
    expect(PRICE_BUCKET_EDGES_CENTS).toContain(270_000);
    expect(bucketPrice(0)).toBe('under_500');
    expect(bucketPrice(49_999)).toBe('under_500');
    expect(bucketPrice(50_000)).toBe('500_1000');
    expect(bucketPrice(269_999)).toBe('2000_2700');
    expect(bucketPrice(270_000)).toBe('2700_5000');
    expect(bucketPrice(10_000_000)).toBe('over_10000');
    // The ladder is monotonic: a higher price can never land in a lower bucket, which is what lets
    // the funnels answer "did 3D-bearing items clear their capture cost" from the bucket column alone.
    const seen = PRICE_BUCKET_EDGES_CENTS.map(bucketPrice);
    expect(new Set(seen).size).toBe(seen.length);
    expect(() => bucketPrice(12.5)).toThrow(TypeError);
    expect(() => bucketPrice(-1)).toThrow(TypeError);
  });

  it('consumes the Money so the cents cannot escape the call site', () => {
    const bucket = priceBucket(money(3_450_00)); // R3 450,00
    expect(typeof bucket).toBe('string');
    expect(PRICE_BUCKETS).toContain(bucket);
    // R2 700 is the capture break-even, so R3 450 sits one bucket above it and nothing in the event
    // says how far above: a funnel cannot recover the price from the row.
    expect(bucket).toBe('2700_5000');
  });
});
