import { describe, expect, it } from 'bun:test';
import { scorePassword } from './strength.js';

/**
 * One test per scorer rule, plus the two properties that make it a scorer and not a gate:
 * `blocks` is always false, and every penalty emits advice that explains it.
 */

describe('strength.ts rules', () => {
  it('rule: common passwords score 0 whatever the length looks like', () => {
    const r = scorePassword('password123');
    expect(r.score).toBe(0);
    expect(r.advice.join(' ')).toMatch(/attackers try first/i);
  });

  it('rule: "p@ssw0rd" leetspeak variant is still a common password', () => {
    expect(scorePassword('p@ssw0rd').score).toBe(0);
  });

  it('rule: the account holder’s own number typed in national form is a 0', () => {
    const r = scorePassword('0821234567', { phoneDigits: '+27821234567' });
    expect(r.score).toBe(0);
    expect(r.advice.join(' ')).toMatch(/own phone number/i);
  });

  it('rule: the account holder’s own number typed in E.164 form is a 0', () => {
    expect(scorePassword('27821234567', { phoneDigits: '+27821234567' }).score).toBe(0);
  });

  it('rule: an email local part embedded in the password is flagged', () => {
    const r = scorePassword('thandi2024keeper', { emailLocal: 'thandi' });
    expect(r.score).toBe(0);
    expect(r.advice.join(' ')).toMatch(/phone number or name/i);
  });

  it('rule: three-time repeats cost half the entropy and say so', () => {
    const withRun = scorePassword('ssshhhhhhhkeys');
    const without = scorePassword('keysandlocksdoor');
    expect(withRun.advice.join(' ')).toMatch(/Repeated letters/i);
    expect(withRun.score).toBeLessThanOrEqual(without.score);
  });

  it('rule: keyboard sequence "qwerty" is detected as a sequence', () => {
    expect(scorePassword('myqwertyplate').advice.join(' ')).toMatch(/Sequences/i);
  });

  it('rule: digit run "1234" is detected as a sequence', () => {
    expect(scorePassword('r6k1234plate').advice.join(' ')).toMatch(/Sequences/i);
  });

  it('rule: reverse sequence "9876" is detected too', () => {
    expect(scorePassword('plate9876door').advice.join(' ')).toMatch(/Sequences/i);
  });

  it('rule: all-digit passwords are capped at Weak even when long', () => {
    const r = scorePassword('8712039485710293'); // 16 digits: high nominal entropy
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.advice.join(' ')).toMatch(/shoulder-surf/i);
  });

  it('rule: under 8 characters emits the floor advice', () => {
    expect(scorePassword('ab1!x').advice.join(' ')).toMatch(/Eight characters/i);
  });

  it('rule: a long multi-word lowercase passphrase reaches Strong without symbols', () => {
    const r = scorePassword('correct horse battery staple');
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  it('rule: a weak-but-legal password is allowed to continue — the scorer never blocks', () => {
    const r = scorePassword('ilovebraai');
    expect(r.blocks).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(1); // legal, advised, not locked out
  });

  it('rule: empty input gets guidance, not an exception', () => {
    const r = scorePassword('');
    expect(r.score).toBe(0);
    expect(r.label).toBe('Very weak');
    expect(r.blocks).toBe(false);
  });

  it('rule: low scores always carry at least one piece of advice', () => {
    for (const pw of ['abc', '111111', 'passw0rd', '0761234567']) {
      const r = scorePassword(pw);
      if (r.score <= 1) expect(r.advice.length).toBeGreaterThan(0);
    }
  });

  it('property: blocks is false for every input shape tried above and some more', () => {
    const samples = ['', 'a', 'password', 'PASSWORD1234', '0123456789', 'x'.repeat(64), '!@#$%^&*()_+'];
    for (const pw of samples) expect(scorePassword(pw).blocks).toBe(false);
  });

  it('property: adding characters from a fresh class never lowers the score', () => {
    const a = scorePassword('braai weekend');
    const b = scorePassword('Braai weekend');
    expect(b.score).toBeGreaterThanOrEqual(a.score);
  });

  it('labels track scores: a weak password reads weak and a passphrase reads strong', () => {
    const weak = scorePassword('abc123');
    const strong = scorePassword('correct horse battery staple');
    expect(weak.score).toBeLessThan(strong.score);
    expect(weak.label).toBe('Very weak');
    expect(['Strong', 'Very strong']).toContain(strong.label);
  });
});
