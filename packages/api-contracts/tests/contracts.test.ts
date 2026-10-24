/**
 * The wire contracts, pinned.
 *
 * This package is the authority for shapes that three apps and the payload check read, and it had no
 * tests: a state added to the union but not to `ORDER_STATES`, or a budget edited in one unit and not
 * the other, would have shipped silently. The assertions below are the properties the rest of the
 * system depends on, plus one compile-time guard that cannot drift the way a runtime loop can.
 */

import { describe, expect, it } from 'bun:test';
import {
  CLAIM_SCOPE_DISCLOSURE,
  ORDER_STATES,
  TIER_LABELS,
  budgets,
  money,
  type OrderState,
  type VerificationTier,
} from '../src/index.js';

const BANNED_TRUST_WORDS = ['verified', 'guaranteed', 'authenticated', 'certified'];

describe('money', () => {
  it('refuses fractional cents instead of rounding a ledger value', () => {
    expect(() => money(10.5)).toThrow(TypeError);
    expect(() => money(Number.NaN)).toThrow(TypeError);
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('defaults to ZAR and preserves the value it was given', () => {
    expect(money(270_000)).toEqual({ cents: 270_000, currency: 'ZAR' });
    expect(money(0).cents).toBe(0);
    expect(money(-500).cents).toBe(-500);
  });
});

describe('the order ladder', () => {
  it('lists every state the union names, and only those', () => {
    // Compile-time guard: adding a variant to `OrderState` makes this object incomplete and tsc fails,
    // which is the failure mode a `for` loop over an array cannot catch.
    const everyState: Record<OrderState, true> = {
      AWAITING_PAYMENT: true,
      PAID: true,
      HANDOVER_SCHEDULED: true,
      HANDOVER_CONFIRMED: true,
      COMPLETED: true,
      CANCELLED: true,
      REFUND_PENDING: true,
      REFUNDED: true,
      IN_DISPUTE: true,
    };
    expect(new Set(ORDER_STATES).size).toBe(ORDER_STATES.length);
    expect(ORDER_STATES.slice().sort()).toEqual(Object.keys(everyState).sort());
  });

  it('carries IN_DISPUTE as a state, not an overlay on PAID', () => {
    // The dispute flow renders the order as "in dispute" and the money views must stop offering a
    // refund; if this ever became a boolean flag on PAID, that promise would be unenforceable here.
    expect(ORDER_STATES).toContain('IN_DISPUTE');
    expect(ORDER_STATES).toContain('REFUND_PENDING');
  });
});

describe('verification tiers', () => {
  it('labels exactly the five tiers in the product vocabulary', () => {
    const tiers: readonly VerificationTier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];
    expect(Object.keys(TIER_LABELS).sort()).toEqual([...tiers].sort());
    for (const label of Object.values(TIER_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(2);
      expect(label.length).toBeLessThanOrEqual(24);
    }
  });

  it('says what was done, never that the item is verified', () => {
    for (const label of Object.values(TIER_LABELS)) {
      const lower = label.toLowerCase();
      for (const word of BANNED_TRUST_WORDS) {
        expect(lower).not.toContain(word);
      }
    }
  });
});

describe('claim-scope disclosure', () => {
  it('has a disclosure for every scope, long enough to be one', () => {
    for (const scope of ['geometry_and_external_condition', 'condition_only', 'none'] as const) {
      expect(CLAIM_SCOPE_DISCLOSURE[scope].trim().length).toBeGreaterThan(20);
    }
  });

  it('names the three things a model does not evidence', () => {
    const disclosure = CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition.toLowerCase();
    expect(disclosure).toContain('not how it works');
    expect(disclosure).toContain('not its authenticity');
    expect(disclosure).toContain('not whether it is water-resistant');
  });

  it('claims nothing for a decorative model, and no disclosure uses a trust word', () => {
    expect(CLAIM_SCOPE_DISCLOSURE.none.toLowerCase()).toContain('evidences nothing');
    for (const text of Object.values(CLAIM_SCOPE_DISCLOSURE)) {
      const lower = text.toLowerCase();
      for (const word of BANNED_TRUST_WORDS) {
        expect(lower).not.toContain(word);
      }
    }
  });
});

describe('payload budgets', () => {
  it('keeps every ceiling positive', () => {
    for (const [name, value] of Object.entries(budgets)) {
      expect(`${name}=${value}`).not.toContain('NaN');
      expect(value).toBeGreaterThan(0);
    }
  });

  it('keeps the home ceiling above the shared first-paint chunk, which is part of it', () => {
    expect(budgets.homeJsKb).toBeGreaterThan(budgets.firstPaintJsKb);
    expect(budgets.sceneExtraJsKb).toBeGreaterThan(budgets.firstPaintJsKb);
  });

  it('keeps the byte guard and the megabyte budget in the same unit', () => {
    // Two numbers that encode one decision: the loader refuses a fetch over the byte guard, and the
    // payload gate measures against the MB figure. Editing one and not the other is the bug this pins.
    expect(budgets.sceneLodMaxBytes).toBe(budgets.sceneAssetMb * 1024 * 1024);
  });
});
