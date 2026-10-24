/**
 * The state ladder and the money-bearing rule, pinned to the PHP ledger's facts
 * (`nastech-market-php/src/Orders/Order.php`, `Settlements/InitiateRefund.php`,
 * `Settlements/SettleRefund.php`) — the vocabulary the checkout UI is allowed to render.
 */

import { describe, it, expect } from 'bun:test';
import {
  ORDER_TRANSITIONS,
  MONEY_BEARING_ORDER_EVENTS,
  isOpenForPayment,
  paymentIsSettled,
  refundHasMovedMoney,
  resolvePhase,
  STATUS_COPY,
  moneyQuestionCopy,
  canApplyOrderEvent,
  isTerminalOrderStatus,
} from './state-machine.js';
import type { PaymentIntentResult } from './api/checkout-transport.js';
import { money } from '@nastech/api-contracts';

function intent(state: PaymentIntentResult['state'], failureReason: PaymentIntentResult['failureReason'] = null): PaymentIntentResult {
  return {
    intentId: 'pi_test',
    idempotencyKey: 'ik_test',
    state,
    amount: money(420_000),
    method: 'CARD',
    providerReference: 'REF-1',
    failureReason,
  };
}

describe('the real ladder (wave-b facts, not the old brief’s invented names)', () => {
  it('AWAITING_PAYMENT has exactly two doors and PAID is reachable only via PAYMENT_RECORDED', () => {
    expect(ORDER_TRANSITIONS.AWAITING_PAYMENT).toEqual({
      PAYMENT_RECORDED: 'PAID',
      CANCELLED: 'CANCELLED',
    });
    expect(canApplyOrderEvent('AWAITING_PAYMENT', 'PAYMENT_RECORDED')).toBe(true);
    expect(canApplyOrderEvent('AWAITING_PAYMENT', 'HANDOVER_CONFIRMED')).toBe(false);
    expect(canApplyOrderEvent('HANDOVER_SCHEDULED', 'PAYMENT_RECORDED')).toBe(false);
  });

  it('the happy path walks the whole ladder with no invented shortcuts', () => {
    expect(ORDER_TRANSITIONS.AWAITING_PAYMENT.PAYMENT_RECORDED).toBe('PAID');
    expect(ORDER_TRANSITIONS.PAID.HANDOVER_SCHEDULED).toBe('HANDOVER_SCHEDULED');
    expect(ORDER_TRANSITIONS.HANDOVER_SCHEDULED.HANDOVER_CONFIRMED).toBe('HANDOVER_CONFIRMED');
    expect(ORDER_TRANSITIONS.HANDOVER_CONFIRMED.ORDER_COMPLETED).toBe('COMPLETED');
  });

  it('money-bearing is exactly PAYMENT_RECORDED, ORDER_COMPLETED, REFUND_SETTLED — REFUND_INITIATED is NOT', () => {
    expect([...MONEY_BEARING_ORDER_EVENTS].sort()).toEqual(['ORDER_COMPLETED', 'PAYMENT_RECORDED', 'REFUND_SETTLED']);
    expect(refundHasMovedMoney('REFUND_INITIATED')).toBe(false);
    expect(refundHasMovedMoney('REFUND_SETTLED')).toBe(true);
  });

  it('terminal states have no doors (Order::isTerminal)', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'REFUNDED'] as const) {
      expect(isTerminalOrderStatus(status)).toBe(true);
      expect(ORDER_TRANSITIONS[status]).toEqual({});
    }
    expect(isTerminalOrderStatus('AWAITING_PAYMENT')).toBe(false);
  });

  it('post-capture statuses are never open for a new payment', () => {
    expect(isOpenForPayment('AWAITING_PAYMENT')).toBe(true);
    for (const status of ['PAID', 'HANDOVER_SCHEDULED', 'HANDOVER_CONFIRMED', 'COMPLETED', 'REFUNDED', 'CANCELLED', 'REFUND_PENDING', 'IN_DISPUTE'] as const) {
      expect(isOpenForPayment(status)).toBe(false);
    }
  });
});

describe('resolvePhase: server truth beats every local memory', () => {
  it('a captured intent with the order still AWAITING_PAYMENT resolves — it does not claim paid', () => {
    // The webhook-in-flight window: RecordProviderPayment claimed the event but PAID isn’t
    // visible to us yet. Saying “Paid” here would be the client pre-booking the ledger.
    expect(resolvePhase('AWAITING_PAYMENT', intent('captured'))).toBe('resolving');
  });

  it('PAID status alone reaches the outcome — even with no intent we ever saw', () => {
    // Browser died, response never arrived, webhook booked it: the returning visit must say paid.
    expect(resolvePhase('PAID', null)).toBe('outcome');
    expect(paymentIsSettled('PAID')).toBe(true);
  });

  it('a failed intent at AWAITING_PAYMENT lands on the outcome (declined copy), never on resolving', () => {
    expect(resolvePhase('AWAITING_PAYMENT', intent('failed', 'card_declined'))).toBe('outcome');
  });

  it('REFUND_PENDING renders as money-not-yet-moved', () => {
    expect(STATUS_COPY.REFUND_PENDING.moneyMoved).toBe(false);
    expect(STATUS_COPY.REFUND_PENDING.title).toBe('Refund initiated — money has not moved yet');
    expect(STATUS_COPY.REFUNDED.moneyMoved).toBe(true);
    expect(moneyQuestionCopy('REFUND_PENDING', intent('captured'))).toContain('NOT been returned');
  });

  it('no AWAITING_PAYMENT phase ever claims payment happened', () => {
    for (const st of ['awaiting_provider', 'requires_redirect', 'captured'] as const) {
      const copy = moneyQuestionCopy('AWAITING_PAYMENT', intent(st));
      expect(copy).not.toMatch(/^You paid/);
    }
    expect(moneyQuestionCopy('PAID', intent('captured'))).toContain('You paid');
  });

  it('a declined card copy promises “nothing was charged”, which is true for a decline', () => {
    const copy = moneyQuestionCopy('AWAITING_PAYMENT', intent('failed', 'card_declined'));
    expect(copy).toContain('Nothing was charged');
  });
});
