import { useState } from 'react';
import type { CSSProperties } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { MoneyText } from '@nastech/design-system';
import type { HandoverTokenView, NoShowReport } from './api/handover-transport.js';

/**
 * The other person has not arrived.
 *
 * Silence at this moment is what creates disputes, so the screen answers the two questions a
 * person standing at a police-station forecourt is actually asking: <em>what do I do</em> and
 * <em>where is my money</em> — and it answers both in one line each, with one primary action.
 *
 * The money line is bounded by the ledger, not by optimism. Reporting a no-show opens a refund
 * REQUEST (`REFUND_INITIATED`, which `Order::isMoneyBearing` excludes). Money moves at
 * `REFUND_SETTLED`, a separate event with a separate date the app does not control. So: the
 * window's expiry is the deadline the app can state; the settlement time is the range support
 * can state, labelled as a range.
 */

export interface NotShownProps {
  readonly token: HandoverTokenView;
  readonly windowOpen: boolean;
  readonly onReport: () => Promise<NoShowReport>;
}

export function NotShown({ token, windowOpen, onReport }: NotShownProps) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<NoShowReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report0 = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await onReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the report. Nothing was lost — try once more.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="not-shown"
      aria-label="The other person has not arrived"
      style={{ display: 'grid', gap: raw.space.s3, padding: raw.space.s4, border: `1px solid ${raw.color.signalCaution}`, borderRadius: raw.radius.md }}
    >
      <h2 style={{ margin: 0, fontSize: '1.125rem', color: tokens.text.primary, fontFamily: raw.type.familyText }}>
        They haven’t arrived
      </h2>

      <p style={line}>
        <strong>What happens to your money:</strong> the <MoneyText value={token.heldBuyerTotal} /> you paid is
        held by NasTech. It has not gone to the seller, and it will not. Nothing you do here spends it.
      </p>

      {!report ? (
        <>
          <p style={line}>
            <strong>What happens next:</strong> report it and the ledger opens a refund request. Your money
            returns to the card or account you paid from <em>when the refund settles</em> — not when you press
            this button.
            {windowOpen
              ? ' The exchange window is still open, so you can also reissue and try for another time; reporting does not close that door.'
              : ' This exchange window has closed, so reissue is the only way to try again.'}
          </p>
          <div style={{ display: 'flex', gap: raw.space.s3, flexWrap: 'wrap', alignItems: 'center' }}>
            <button data-testid="not-shown-report" type="button" onClick={() => void report0()} disabled={busy} style={primary(!busy)}>
              {busy ? 'Sending…' : 'Report they didn’t show'}
            </button>
            <span style={{ fontFamily: raw.type.familyText, fontSize: '0.8125rem', color: tokens.text.secondary }}>
              Usually settled within 2–5 working days, on the refund side. If it hasn’t landed by then, the order
              number above is what support asks for.
            </span>
          </div>
          {error !== null ? <p role="alert" style={{ ...line, color: raw.color.signalNegative }}>{error}</p> : null}
        </>
      ) : (
        <div role="status" data-testid="not-shown-done" style={{ display: 'grid', gap: raw.space.s2 }}>
          <p style={{ ...line, color: raw.color.signalPositive, fontWeight: 600 }}>
            Reported. A refund request is now open on order {report.orderId}.
          </p>
          <p style={line}>
            {report.moneyMovedNow
              ? 'The refund has already moved.'
              : 'Your money is still held and the refund has not settled yet — that is normal, and it is the next step, not a stall.'}
            {' '}The ledger records the request now and the movement when it settles; both are dated on your order.
          </p>
          <p style={line}>
            Keep the app open for a few minutes. If the other side arrives and confirms before the window closes,
            the exchange can still complete and the refund request is superseded by the ledger, not by you.
          </p>
        </div>
      )}
    </section>
  );
}

const line: CSSProperties = {
  margin: 0,
  fontFamily: raw.type.familyText,
  fontSize: '0.9375rem',
  color: tokens.text.primary,
  lineHeight: 1.55,
};

const primary = (enabled: boolean): CSSProperties => ({
  padding: `${raw.space.s3} ${raw.space.s5}`,
  borderRadius: raw.radius.sm,
  border: 'none',
  background: enabled ? tokens.action.default : raw.color.ink100,
  color: enabled ? raw.color.paper : tokens.text.disabled,
  fontFamily: raw.type.familyText,
  fontWeight: 700,
  fontSize: '1rem',
  cursor: enabled ? 'pointer' : 'not-allowed',
});
