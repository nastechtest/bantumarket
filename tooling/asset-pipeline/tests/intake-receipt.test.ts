import { describe, expect, test } from 'bun:test';
import { CLAIM_SCOPE_DISCLOSURE, money } from '@nastech/api-contracts';
import { CaptureError } from '../errors.js';
import { CustodyLog } from '../custody.js';
import {
  BREAK_EVEN_CENTS,
  CAPTURE_COST_CENTS,
  TAKE_RATE,
  assessCaptureViability,
  issueReceipt,
  matchReceiptToCustody,
  receiptCodeIsWellFormed,
  renderReceiptText,
  requireCaptureViability,
  verifyReceiptCode,
  type ReceiptInput,
} from '../intake-receipt.js';

const HASH = 'a'.repeat(64);

function receiptFor(priceCents: number, over: Partial<ReceiptInput> = {}) {
  const log = new CustodyLog();
  const genesis = log.append({ jobId: 'job_r1', from: null, to: 'intake', actor: 'officer_nomsa', at: '2026-04-01T08:00:00.000Z', evidence: 'item=itm_seiko;price=420000' });
  return {
    log,
    receipt: issueReceipt({
      jobId: 'job_r1',
      itemId: 'itm_seiko',
      listingId: 'lst_01',
      title: 'Seiko Presage automatic, 40.5 mm',
      price: money(priceCents),
      takenBy: 'officer_nomsa',
      studio: 'Studio 1, Woodstock',
      at: '2026-04-01T08:00:00.000Z',
      custodyStartHash: genesis.hash,
      conditionNotes: over['conditionNotes'] ?? ['light scratch on clasp'],
      ...over,
    }),
  };
}

describe('capture economics', () => {
  test('the break-even line is derived from cost and take rate, not typed twice', () => {
    expect(BREAK_EVEN_CENTS).toBe(Math.round(CAPTURE_COST_CENTS / TAKE_RATE));
    expect(BREAK_EVEN_CENTS).toBe(270_000);
  });

  test('an item at exactly the line clears it, and one rand under does not', () => {
    expect(assessCaptureViability(money(270_000)).viable).toBe(true);
    expect(assessCaptureViability(money(269_900)).viable).toBe(false);
    const under = assessCaptureViability(money(269_900));
    if (!under.viable) expect(under.headroomCents).toBeLessThan(0);
  });

  test('a R4,200 watch has room for its own capture', () => {
    const verdict = assessCaptureViability(money(420_000));
    expect(verdict.viable).toBe(true);
    expect(verdict.commissionCents).toBe(42_000);
    expect(verdict.headroomCents).toBe(42_000 - CAPTURE_COST_CENTS);
    expect(verdict.reason).toInclude('headroom');
  });

  test('a R450 item is refused, and the refusal names the static path', () => {
    let caught: unknown;
    try {
      requireCaptureViability(money(45_000));
    } catch (error) {
      caught = error;
    }
    const error = caught as CaptureError;
    expect(error.code).toBe('capture_not_viable');
    expect(error.exitCode).not.toBe(0);
    expect(error.operatorSentence).toInclude('R450.00');
    expect(error.operatorSentence).toInclude('R2,700.00');
    expect(error.hint).toInclude('static path');
  });

  test('anything other than ZAR is refused rather than converted', () => {
    expect(() => assessCaptureViability({ cents: 420_000 as never, currency: 'USD' as never })).toThrow(CaptureError);
    expect(() => assessCaptureViability({ cents: 420_000.5 as never, currency: 'ZAR' })).toThrow(CaptureError);
  });
});

describe('intake receipt', () => {
  test('the code is derivable from the record and well-formed for a desk to read back', () => {
    const { receipt } = receiptFor(420_000);
    expect(receiptCodeIsWellFormed(receipt.code)).toBe(true);
    expect(verifyReceiptCode(receipt).ok).toBe(true);
  });

  test('changing the price on a printed receipt breaks its own code', () => {
    const { receipt } = receiptFor(420_000);
    const forged = { ...receipt, priceCents: 120_000 };
    const verdict = verifyReceiptCode(forged);
    expect(verdict.ok).toBe(false);
    expect(verdict.expected).not.toBe(receipt.code);
  });

  test('the receipt prints the item, the taker, the custody instant and the code', () => {
    const { receipt } = receiptFor(420_000);
    const text = renderReceiptText(receipt);
    expect(text).toInclude(receipt.code);
    expect(text).toInclude('itm_seiko');
    expect(text).toInclude('officer_nomsa');
    expect(text).toInclude('2026-04-01T08:00:00.000Z');
    expect(text).toInclude('R4,200.00');
    expect(text).toInclude('light scratch on clasp');
  });

  test('the receipt quotes the contract’s disclosure sentence, verbatim, and promises nothing more', () => {
    const { receipt } = receiptFor(420_000);
    expect(receipt.scopeDisclosure).toBe(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
    const text = renderReceiptText(receipt);
    expect(text).toInclude(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
    // spec §13.2: the pipeline may not imply a check that did not happen. The contract's own
    // disclosure is the one place these words are allowed, and only in the negative — so the test
    // removes that sentence and requires nothing verification-shaped to survive it.
    const withoutContractSentence = text.replace(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition, '').toLowerCase();
    for (const forbidden of ['verified', 'verifie', 'authentic', 'guarantee', 'serviced', 'water-resistant', 'genuine']) {
      expect(withoutContractSentence).not.toInclude(forbidden);
    }
  });

  test('a receipt cannot be issued without the custody row that it cites', () => {
    expect(() =>
      issueReceipt({
        jobId: 'job_r2',
        itemId: 'itm_2',
        listingId: null,
        title: 'Casio',
        price: money(420_000),
        takenBy: 'officer_nomsa',
        studio: 'Studio 1',
        at: '2026-04-01T08:00:00.000Z',
        custodyStartHash: 'not-a-digest',
      }),
    ).toThrow(CaptureError);
    expect(() =>
      issueReceipt({
        jobId: 'job_r2',
        itemId: 'itm_2',
        listingId: null,
        title: 'Casio',
        price: money(420_000),
        takenBy: '   ',
        studio: 'Studio 1',
        at: '2026-04-01T08:00:00.000Z',
        custodyStartHash: HASH,
      }),
    ).toThrow(CaptureError);
  });

  test('the paper matches the log when the item is really the one taken in', () => {
    const { log, receipt } = receiptFor(420_000);
    const verdict = matchReceiptToCustody(receipt, log);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.actor).toBe('officer_nomsa');
      expect(verdict.startedAt).toBe('2026-04-01T08:00:00.000Z');
    }
  });

  test('a swapped-in name on the paper fails the match', () => {
    const { log, receipt } = receiptFor(420_000);
    const verdict = matchReceiptToCustody({ ...receipt, takenBy: 'officer_molele' }, log);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toInclude('officer_nomsa');
  });

  test('a receipt for a job the studio never opened fails the match', () => {
    const { receipt } = receiptFor(420_000);
    const verdict = matchReceiptToCustody(receipt, new CustodyLog());
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toInclude('No custody history');
  });

  test('a receipt citing a different custody row than the log holds fails the match', () => {
    const { log, receipt } = receiptFor(420_000);
    const verdict = matchReceiptToCustody({ ...receipt, custodyStartHash: 'b'.repeat(64) }, log);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toInclude('digest');
  });
});
