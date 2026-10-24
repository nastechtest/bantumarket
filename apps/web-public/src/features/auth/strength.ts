/**
 * Password strength scorer. Advisory only, by product decision: this market's users type
 * passwords with one thumb on a $100 phone, and a scorer that locks someone out of a legal
 * password manufactures support tickets, not security. The scorer tells the truth about the
 * password; enforcement (if any) belongs server-side at the registration endpoint, not here.
 *
 * This is deliberately not zxcvbn (no new dependencies allowed). It is a transparent set of
 * rules — each one tested individually in strength.test.ts — over an entropy estimate, so the
 * advice lines always correspond to something that actually lowered the score.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface StrengthResult {
  readonly score: StrengthScore;
  readonly label: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong';
  /** What would raise the score, in the order that helps most. Never a block message. */
  readonly advice: readonly string[];
  /**
   * Always false. The field exists so every call site that asks "must I block this?" gets the
   * same answer it would from a future server verdict, and the server — when it exists — owns it.
   */
  readonly blocks: false;
}

const COMMON = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'qwerty',
  'abc123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'letmein',
  'welcome',
  'welcome1',
  'iloveyou',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'hunter2',
  '000000',
  '696969',
  'test1234',
]);

/** QWERTY rows and the alphabet/digit runs people type when asked for "anything". */
const RUNS = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export interface StrengthContext {
  /** The account's own phone number: "0821234567" as a password is a gift to an account-taker. */
  readonly phoneDigits?: string;
  /** Local part of the account email, if one exists. */
  readonly emailLocal?: string;
  readonly name?: string;
}

function entropyBits(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  if (pool === 0) return 0;
  return pw.length * Math.log2(pool);
}

function hasRepeatRun(pw: string): boolean {
  return /(.)\1{2,}/.test(pw);
}

function hasSequence(pw: string): boolean {
  const lower = pw.toLowerCase();
  for (const run of RUNS) {
    for (let i = 0; i + 4 <= run.length; i++) {
      const frag = run.slice(i, i + 4);
      const back = [...frag].reverse().join('');
      if (lower.includes(frag) || lower.includes(back)) return true;
    }
  }
  return false;
}

const LABELS: readonly [StrengthResult['label'], StrengthResult['label'], StrengthResult['label'], StrengthResult['label'], StrengthResult['label']] = [
  'Very weak',
  'Weak',
  'Fair',
  'Strong',
  'Very strong',
];

export function scorePassword(pw: string, context: StrengthContext = {}): StrengthResult {
  const advice: string[] = [];

  if (pw === '') {
    return { score: 0, label: 'Very weak', advice: ['Type a password — anything you can remember.'], blocks: false };
  }

  let bits = entropyBits(pw);

  // Rule: dictionary/common passwords are what credential-stuffers try first, whatever the length.
  if (COMMON.has(pw.toLowerCase())) {
    advice.push('That is one of the passwords attackers try first. Any longer phrase you make up is better.');
    return { score: 0, label: 'Very weak', advice, blocks: false };
  }

  // Rule: the account's own identifiers must never be the password — a caller who knows the
  // phone number (every seller does) then knows the password. Compared across dialing shapes:
  // a buyer who types their own number types `082…`, the account knows `+2782…`, same digits.
  const digitsOnly = pw.replace(/\D/g, '');
  const ctxPhone = context.phoneDigits?.replace(/\D/g, '');
  const phoneForms =
    ctxPhone !== undefined && ctxPhone.length >= 9
      ? [ctxPhone, ctxPhone.slice(-9), `0${ctxPhone.slice(-9)}`, `27${ctxPhone.slice(-9)}`]
      : [];
  const identityStrings = [context.emailLocal?.toLowerCase(), context.name?.toLowerCase()].filter(
    (x): x is string => typeof x === 'string' && x.length >= 4,
  );
  const matchesOwnPhone = phoneForms.includes(digitsOnly) && /^\d+$/.test(pw);
  const containsIdentity = identityStrings.some((c) => pw.toLowerCase().includes(c));
  if (matchesOwnPhone || containsIdentity) {
    advice.push('Do not use your own phone number or name as the password — people who can message you can read that off the order.');
    return { score: 0, label: 'Very weak', advice, blocks: false };
  }

  // Rule: runs of the same character carry almost no information.
  if (hasRepeatRun(pw)) {
    bits *= 0.5;
    advice.push('Repeated letters ("aaa") do not add strength. Length from different letters does.');
  }

  // Rule: keyboard/alphabet sequences are the first thing any cracking list contains.
  if (hasSequence(pw)) {
    bits *= 0.6;
    advice.push('Sequences like "1234" or "abcd" are tried first. Break them up.');
  }

  // Rule: digits-only even long passwords have small pools and match SMS-code-shaped guesses.
  if (/^\d+$/.test(pw)) {
    advice.push('All-digits is easy to shoulder-surf. A word plus a few numbers is much stronger.');
  }

  // Rule: length is the cheapest strength there is for a one-thumb typist.
  if (pw.length < 8) {
    advice.push('Eight characters or more is the floor. Add a word rather than symbols.');
  } else if (pw.length >= 12 && /^[a-z ]+$/i.test(pw) && !hasSequence(pw)) {
    // Passphrase bonus: three or more real-ish words beat "P@$$w0rd!" and are typeable.
    if (/\s/.test(pw) || pw.length >= 14) bits += 12;
  }

  if (pw.length >= 8 && pw.length < 12 && bits < 50) {
    advice.push('One more word would push this into safe territory.');
  }
  if (!/[A-Z]/.test(pw) && !/[^a-zA-Z0-9]/.test(pw) && pw.length < 14) {
    advice.push('A capital or a symbol helps, but a fourth word helps more.');
  }

  let score: StrengthScore;
  if (bits < 28) score = 0;
  else if (bits < 40) score = 1;
  else if (bits < 55) score = 2;
  else if (bits < 75) score = 3;
  else score = 4;

  // Rule: all-digits caps at "weak" regardless of estimated bits (10-digit phone numbers have
  // high nominal entropy and are still guessable for a target you can call).
  if (/^\d+$/.test(pw) && score > 1) score = 1;

  return { score, label: LABELS[score]!, advice, blocks: false };
}
