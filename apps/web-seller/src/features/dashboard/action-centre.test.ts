import { describe, expect, it } from 'bun:test';
import { money } from '@nastech/api-contracts';
import type { AttentionItem, AttentionKind } from './api/dashboard-transport.js';
import { actionableItems, compareAttention, moneyBucket, orderAttention, summariseAttention } from './action-order.js';

function item(id: string, kind: AttentionKind, cents: number, dueAt: string | null = null): AttentionItem {
  return {
    id,
    kind,
    title: `${kind} ${id}`,
    detail: 'detail',
    href: `/x/${id}`,
    dueAt,
    blockingValue: money(cents).cents,
  };
}

describe('action centre ordering — money before recency', () => {
  it('an unscheduled handover outranks a newer buyer question', () => {
    const handover = item('a', 'handover_unscheduled', 4200);
    const question = item('b', 'question_unanswered', 0);
    // Deliberately give the question every recency advantage the data model has.
    const questionWithDue = { ...question, dueAt: '2026-10-16T09:00:00+02:00' };
    expect(orderAttention([questionWithDue, handover])[0]!.id).toBe('a');
  });

  it('a failed payout and a handover are both money-blocking, and the larger amount wins inside the bucket', () => {
    const payout = item('p', 'payout_failed', 100);
    const handover = item('h', 'handover_unscheduled', 500_000);
    expect(orderAttention([payout, handover])[0]!.id).toBe('h');
    expect(moneyBucket('payout_failed')).toBe(moneyBucket('handover_unscheduled'));
  });

  it('within one bucket the larger blocked amount wins', () => {
    const small = item('small', 'handover_unscheduled', 100);
    const large = item('large', 'handover_unscheduled', 5000);
    expect(orderAttention([small, large]).map((i) => i.id)).toEqual(['large', 'small']);
  });

  it('within equal money the earlier deadline wins, and no deadline sorts last', () => {
    const later = item('later', 'handover_unscheduled', 100, '2026-10-20T12:00:00+02:00');
    const sooner = item('sooner', 'handover_unscheduled', 100, '2026-10-17T12:00:00+02:00');
    const none = item('none', 'handover_unscheduled', 100);
    expect(orderAttention([none, later, sooner]).map((i) => i.id)).toEqual(['sooner', 'later', 'none']);
  });

  it('ties break on id, so the order never flickers between reloads', () => {
    const b = item('b', 'draft_unfinished', 0);
    const a = item('a', 'draft_unfinished', 0);
    expect(orderAttention([b, a]).map((i) => i.id)).toEqual(['a', 'b']);
    expect(compareAttention(a, a)).toBe(0);
  });

  it('does not mutate the transport array', () => {
    const input = Object.freeze([item('z', 'question_unanswered', 0), item('a', 'handover_unscheduled', 1)]);
    const ordered = orderAttention(input);
    expect(input[0]!.id).toBe('z');
    expect(ordered[0]!.id).toBe('a');
  });

  it('buckets are declared for every kind and money-adjacent kinds come first', () => {
    expect(moneyBucket('handover_unscheduled')).toBe(0);
    expect(moneyBucket('payout_failed')).toBe(0);
    expect(moneyBucket('capture_rejected')).toBe(1);
    expect(moneyBucket('draft_unfinished')).toBe(2);
    expect(moneyBucket('question_unanswered')).toBe(3);
  });

  it('waiting-on-us rows are not counted as seller work', () => {
    const items = [item('r', 'listing_in_review', 0), item('h', 'handover_unscheduled', 100), item('q', 'question_unanswered', 0)];
    expect(actionableItems(items).map((i) => i.id)).toEqual(['h', 'q']);
    expect(summariseAttention(items)).toEqual({ total: 3, needsYou: 2, waitingOnPlatform: 1, blockedValue: 100 });
  });

  it('an empty centre summarises to zeros rather than undefined', () => {
    expect(summariseAttention([])).toEqual({ total: 0, needsYou: 0, waitingOnPlatform: 0, blockedValue: 0 });
  });
});
