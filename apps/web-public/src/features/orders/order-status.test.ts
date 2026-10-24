import { describe, it, expect } from 'bun:test';
import {
  ORDER_STATES,
  STATE_LABELS,
  LADDER_STAGES,
  ladderView,
  canAct,
  isMoneyBearingEvent,
  moneyPosition,
} from './state-labels.js';
import { ORDER_TRANSITIONS } from '@nastech/api-client';

/**
 * The map must be TOTAL over the verified ladder and the ladder must be the ledger's. The
 * expected set below is a transcription of the wave-b truth table — deliberately duplicated
 * here as the test's own authority, so drift between the code and the ledger fails THIS test
 * rather than rendering a blank chip in front of a buyer.
 */

const WAVE_B_LADDER = [
  'AWAITING_PAYMENT',
  'PAID',
  'HANDOVER_SCHEDULED',
  'HANDOVER_CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'IN_DISPUTE',
] as const;

describe('state-labels totality', () => {
  it('ORDER_STATES covers exactly the wave-b ladder — missing or invented states fail here', () => {
    const got = [...ORDER_STATES].sort();
    const want = [...WAVE_B_LADDER].sort();
    expect(got).toEqual(want);
  });

  it('every state has non-empty buyer and seller labels and a money note', () => {
    for (const state of WAVE_B_LADDER) {
      const label = (STATE_LABELS as Record<string, (typeof STATE_LABELS)[keyof typeof STATE_LABELS] | undefined>)[state];
      expect(label, `STATE_LABELS is missing ${state}`).toBeDefined();
      expect(label!.buyer.length, `${state} buyer label is blank`).toBeGreaterThan(0);
      expect(label!.seller.length, `${state} seller label is blank`).toBeGreaterThan(0);
      expect(label!.moneyNote.length, `${state} money note is blank`).toBeGreaterThan(0);
    }
  });

  it('the map has no extra keys beyond the ladder (an invented state fails here too)', () => {
    expect(Object.keys(STATE_LABELS).sort()).toEqual([...WAVE_B_LADDER].sort());
  });
});

describe('refund honesty', () => {
  it('REFUND_INITIATED is an event, never a state', () => {
    expect(ORDER_STATES).not.toContain('REFUND_INITIATED');
  });

  it('the refund-request state never reads as money moved', () => {
    const label = STATE_LABELS.REFUND_PENDING;
    expect(label.buyer).not.toMatch(/refunded/i);
    expect(label.buyer).toContain('not yet returned');
    expect(label.moneyNote).toContain('still held');
    expect(label.moneyPosition).toBe('held');
  });

  it('only settlement makes the refund a fact', () => {
    expect(STATE_LABELS.REFUNDED.moneyPosition).toBe('returned');
    expect(isMoneyBearingEvent('REFUND_INITIATED')).toBe(false);
    expect(isMoneyBearingEvent('REFUND_SETTLED')).toBe(true);
  });

  it('money-bearing events are exactly the ledger’s three', () => {
    expect(WAVE_B_LADDER.length).toBe(9);
    expect(isMoneyBearingEvent('PAYMENT_RECORDED')).toBe(true);
    expect(isMoneyBearingEvent('ORDER_COMPLETED')).toBe(true);
    expect(isMoneyBearingEvent('HANDOVER_CONFIRMED')).toBe(false);
    expect(isMoneyBearingEvent('CANCELLED')).toBe(false);
  });

  it('a cancelled order that had been paid is held, not “none”', () => {
    expect(moneyPosition({ status: 'CANCELLED', paidAt: null })).toBe('none');
    expect(moneyPosition({ status: 'CANCELLED', paidAt: '2026-10-05T11:04:31+02:00' })).toBe('held');
  });
});

describe('the transition table the UI trusts', () => {
  it('mirrors the PHP ladder rung by rung', () => {
    expect(ORDER_TRANSITIONS.AWAITING_PAYMENT.PAYMENT_RECORDED).toBe('PAID');
    expect(ORDER_TRANSITIONS.PAID.HANDOVER_SCHEDULED).toBe('HANDOVER_SCHEDULED');
    expect(ORDER_TRANSITIONS.HANDOVER_SCHEDULED.HANDOVER_CONFIRMED).toBe('HANDOVER_CONFIRMED');
    expect(ORDER_TRANSITIONS.HANDOVER_CONFIRMED.ORDER_COMPLETED).toBe('COMPLETED');
    expect(ORDER_TRANSITIONS.REFUND_PENDING.REFUND_SETTLED).toBe('REFUNDED');
    expect(ORDER_TRANSITIONS.IN_DISPUTE.DISPUTE_RESOLVED_TO_SELLER).toBe('HANDOVER_CONFIRMED');
  });

  it('only the provider’s PAYMENT_RECORDED reaches PAID — no handover event does', () => {
    for (const [state, events] of Object.entries(ORDER_TRANSITIONS)) {
      for (const [event, target] of Object.entries(events as Record<string, string>)) {
        if (target === 'PAID') {
          expect(event, `${state} must not reach PAID via ${event}`).toBe('PAYMENT_RECORDED');
        }
      }
    }
  });

  it('terminal states leave the ladder with no edges', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'REFUNDED'] as const) {
      expect(Object.keys(ORDER_TRANSITIONS[s]).length, `${s} should be terminal`).toBe(0);
    }
  });
});

describe('permitted actions track the machine', () => {
  it('cancel is offered only where the ledger accepts CANCELLED', () => {
    expect(canAct('AWAITING_PAYMENT', 'cancel')).toBe(true);
    expect(canAct('PAID', 'cancel')).toBe(true);
    for (const s of ['HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'IN_DISPUTE'] as const) {
      expect(canAct(s, 'cancel'), `${s} must not offer cancel`).toBe(false);
    }
  });

  it('handover scheduling is offered only from PAID', () => {
    expect(canAct('PAID', 'schedule_handover')).toBe(true);
    expect(canAct('AWAITING_PAYMENT', 'schedule_handover')).toBe(false);
    expect(canAct('HANDOVER_SCHEDULED', 'schedule_handover')).toBe(false);
  });
});

describe('ladderView', () => {
  it('maps each ladder rung to its stage index', () => {
    LADDER_STAGES.forEach((stage, index) => {
      expect(ladderView(stage.state)).toEqual({ rung: index, side: null });
    });
  });

  it('side states leave the ladder with the right chip', () => {
    expect(ladderView('CANCELLED').side).toBe('cancelled');
    expect(ladderView('REFUND_PENDING').side).toBe('refund');
    expect(ladderView('REFUNDED').side).toBe('refund');
    expect(ladderView('IN_DISPUTE').side).toBe('dispute');
    expect(ladderView('REFUNDED').rung).toBe(-1);
  });
});
