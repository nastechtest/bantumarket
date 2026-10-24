import { describe, expect, it } from 'bun:test';
import { AuditStampError, auditStampLine, createAuditStamp, isAuditStamp, stampDiff } from './audit-stamp.js';

const base = {
  actor: 'staff_thandi',
  role: 'reviewer' as const,
  target: 'lst_01',
  reason: 'Photos match the condition record',
  at: '2026-10-22T09:00:00.000Z',
};

describe('audit stamp', () => {
  it('carries actor, role, target, reason and timestamp', () => {
    const stamp = createAuditStamp(base);
    expect(stamp.actor).toBe('staff_thandi');
    expect(stamp.role).toBe('reviewer');
    expect(stamp.target).toBe('lst_01');
    expect(stamp.reason).toBe('Photos match the condition record');
    expect(stamp.at).toBe('2026-10-22T09:00:00.000Z');
    expect(isAuditStamp(stamp)).toBe(true);
  });

  it('refuses each missing field, naming the field', () => {
    const cases: Array<keyof typeof base> = ['actor', 'role', 'target', 'reason', 'at'];
    for (const field of cases) {
      const broken = { ...base, [field]: '' };
      let caught: unknown = null;
      try {
        createAuditStamp(broken);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(AuditStampError);
      expect((caught as AuditStampError).field).toBe(field);
    }
  });

  it('refuses a reason too short to review later', () => {
    expect(() => createAuditStamp({ ...base, reason: 'ok' })).toThrow(AuditStampError);
  });

  it('refuses a local time or date-only timestamp', () => {
    expect(() => createAuditStamp({ ...base, at: '2026-10-22 09:00' })).toThrow(AuditStampError);
    expect(() => createAuditStamp({ ...base, at: '2026-10-22' })).toThrow(AuditStampError);
  });

  it('treats a malformed stamp as absent rather than partially valid', () => {
    expect(isAuditStamp({ ...base, actor: '' })).toBe(false);
    expect(isAuditStamp(null)).toBe(false);
    expect(isAuditStamp({})).toBe(false);
  });

  it('renders one reviewable line', () => {
    expect(auditStampLine(createAuditStamp(base))).toBe(
      'staff_thandi (reviewer) → lst_01: Photos match the condition record @ 2026-10-22T09:00:00.000Z',
    );
  });

  it('shows the fields that changed between two stamps', () => {
    const before = createAuditStamp(base);
    const after = createAuditStamp({ ...base, reason: 'Second reviewer checked the crown', at: '2026-10-22T10:00:00.000Z' });
    const diff = stampDiff(before, after);
    expect(diff.map((row) => row.term)).toEqual(['Reason', 'Timestamp']);
    expect(diff[0]).toEqual({ term: 'Reason', before: base.reason, after: 'Second reviewer checked the crown' });
  });
});
