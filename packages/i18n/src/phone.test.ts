/**
 * Phone normalisation. The brief's accepted shapes (`+27…`, `08…`, `0 8…`) and the UK-10-digit trap
 * that a length-only parser fails to catch are all pinned here.
 */

import { describe, it, expect } from 'bun:test';
import { formatPhone, toE164, parsePhone, formatPhoneNational } from './formatter/phone.js';

describe('parsePhone — accepts South African numbers in every listed shape', () => {
  const valid: ReadonlyArray<readonly [string, string]> = [
    ['+27 82 123 4567', '+27821234567'],
    ['+27821234567', '+27821234567'],
    ['0821234567', '+27821234567'],
    ['0 82 123 4567', '+27821234567'],
    ['082 123 4567', '+27821234567'],
    ['(082) 123-4567', '+27821234567'],
    ['083 900 1234', '+27839001234'],
    ['060 123 4567', '+27601234567'],
    ['021 555 1234', '+27215551234'], // Cape Town landline (0 21 + 7)
    ['+27 12 345 6789', '+27123456789'],
  ];
  for (const [input, e164] of valid) {
    it(`${input} → ${e164}`, () => {
      const result = parsePhone(input);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.e164).toBe(e164);
    });
  }
});

describe('parsePhone — rejects what is not a South African subscriber number', () => {
  it('rejects a UK landline that happens to be 10 digits (no leading zero)', () => {
    const result = parsePhone('2071838301'); // London 020 7183 8301 with the trunk zero stripped
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe('missing-trunk-zero');
  });

  it('rejects a UK number with its own country code', () => {
    const result = parsePhone('+44 7700 900123');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe('not-sa-country-code');
  });

  it('rejects wrong lengths', () => {
    expect(parsePhone('08212345678').valid).toBe(false); // 11 digits
    expect(parsePhone('0821234').valid).toBe(false); // too short
    expect(parsePhone('+2782123456').valid).toBe(false); // +27 + only 8
    expect(parsePhone('0999999999').valid).toBe(false); // national starts 9 (unallocated)
  });

  it('rejects empty and junk input without throwing', () => {
    expect(parsePhone('').valid).toBe(false);
    expect(parsePhone('   ').valid).toBe(false);
    expect(parsePhone('not-a-number').valid).toBe(false);
    expect(parsePhone('082 abc defg').valid).toBe(false);
  });
});

describe('formatPhone / toE164 — the throwing canonicaliser', () => {
  it('returns E.164 for a good number', () => {
    expect(formatPhone('0 82 123 4567')).toBe('+27821234567');
    expect(toE164('+27 83 900 1234')).toBe('+27839001234');
  });

  it('throws a TypeError on a bad number (a defect, not user input, at this call site)', () => {
    expect(() => formatPhone('2071838301')).toThrow(TypeError);
  });

  it('renders a human national form for display', () => {
    expect(formatPhoneNational('+27821234567')).toBe('082 123 4567');
    expect(formatPhoneNational('0215551234')).toBe('021 555 1234');
  });
});
