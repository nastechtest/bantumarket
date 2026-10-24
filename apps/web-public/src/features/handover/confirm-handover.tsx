import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { PinField } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import type { HandoverTokenView, PresentPinResult } from './api/handover-transport.js';
import type { WindowView } from '../../lib/window-validity.js';

/**
 * The confirm-handover screen — the moment the ledger is allowed to move toward releasing the
 * hold, so it is engineered like one:
 *
 *   - explicit, never implicit: a checkbox naming exactly what is being sworn to, then a button.
 *     No swipe, no auto-confirm, no "Continue" that hides the act.
 *   - one presentation per side: `ConfirmHandover::handle` derives the actor from the principal
 *     and rejects a second presentation ("the buyer has already confirmed"), so once this side
 *     is in, the PIN field is gone — idempotence by UI *and* by server. The submit handler also
 *     guards against a double-tap firing two POSTs before the first response lands.
 *   - money language is exact: this advances the order; it does not pay the seller. The release
 *     is `COMPLETED`, a different event, a different day (usually minutes later, server-side).
 */

export interface ConfirmHandoverProps {
  readonly token: HandoverTokenView;
  readonly role: 'buyer' | 'seller';
  readonly windowView: WindowView | null;
  readonly busy: boolean;
  readonly last: PresentPinResult | null;
  readonly onPresent: (pin: string) => void;
  readonly onReissue: () => void;
}

export function ConfirmHandover({ token, role, windowView, busy, last, onPresent, onReissue }: ConfirmHandoverProps) {
  const [pin, setPin] = useState('');
  const [ack, setAck] = useState(false);

  const alreadyForMe = role === 'buyer' ? token.buyerConfirmed : token.sellerConfirmed;
  const expired = windowView?.evaluation.status === 'expired';

  if (token.locked) {
    return (
      <Panel testId="confirm-locked" tone="problem">
        <p role="alert" style={text}>
          This code has been locked after too many wrong attempts. No money has moved and the
          exchange itself is not lost — reissue a fresh code and meet again while the window allows.
        </p>
        <ReissueButton onReissue={onReissue} />
      </Panel>
    );
  }

  if (alreadyForMe) {
    const awaiting = token.buyerConfirmed ? 'the seller' : 'the buyer';
    return (
      <Panel testId="confirm-done-side">
        <p role="status" style={text}>
          You have confirmed this handover. Nothing else for you to press — waiting on {awaiting}.
        </p>
        {last?.kind === 'already_presented' ? (
          <p style={muted}>Your earlier confirmation already counts. It cannot double-count.</p>
        ) : null}
      </Panel>
    );
  }

  if (expired) {
    return (
      <Panel testId="confirm-expired" tone="caution">
        <p style={text}>
          The handover window has closed on the server’s clock, so this code no longer confirms
          anything. Your money is still held. Reissue a new window and code — that is the whole fix.
        </p>
        <ReissueButton onReissue={onReissue} />
      </Panel>
    );
  }

  return (
    <form
      data-testid="confirm-handover"
      aria-label="Confirm the handover"
      onSubmit={(e) => {
        e.preventDefault();
        // `busy` mirrors the hook's in-flight ref; the real single-shot guard lives there,
        // because two taps in one batch both read this prop as false. The disabled attribute
        // and this check are UX, not correctness.
        if (busy) return;
        onPresent(pin);
      }}
      style={{ display: 'grid', gap: raw.space.s3 }}
    >
      <PinField
        label="Six-digit handover code"
        hint="The code NasTech sent to you — type it here, on your own phone."
        value={pin}
        onChange={setPin}
        required
      />

      <label style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start', fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary, lineHeight: 1.5 }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>
          I am at the meeting place, the other person is here, and I can see the item. I am
          confirming this exchange happened — in person, now.
        </span>
      </label>

      <button type="submit" disabled={!ack || pin.length !== 6 || busy} style={confirmButton(!ack || pin.length !== 6 || busy)}>
        {busy ? 'Sending your confirmation…' : 'Confirm the exchange'}
      </button>

      <p style={{ ...muted, fontFamily: raw.type.familyText }}>
        What this does: records that <em>you</em> are here and agree the exchange happened. When
        both sides have done it, the order is marked confirmed and the held money is released to
        the seller <strong>when the order completes</strong>. This button does not pay anyone by
        itself — and it can never mark anything “paid”; payment happened earlier, at the provider.
      </p>

      <ResultLine last={last} />
    </form>
  );
}

function ResultLine({ last }: { last: PresentPinResult | null }) {
  if (last === null) return null;
  switch (last.kind) {
    case 'wrong_pin':
      return (
        <p role="alert" data-testid="wrong-pin" style={{ ...text, color: raw.color.signalNegative }}>
          That code did not match. {last.attemptsRemaining} of 5 attempts left — the code is the
          six digits NasTech sent you, not the order number.
        </p>
      );
    case 'expired':
      return <p role="alert" style={{ ...text, color: raw.color.signalCaution }}>The window closed on the server’s clock — reissue instead.</p>;
    case 'revoked':
      return <p role="alert" style={{ ...text, color: raw.color.signalCaution }}>This code was replaced by a newer one; use the latest code you were sent.</p>;
    case 'locked':
      return <p role="alert" style={{ ...text, color: raw.color.signalNegative }}>This code is locked after failed attempts. Reissue a fresh one.</p>;
    case 'already_presented':
      return <p style={muted}>Your confirmation was already recorded.</p>;
    case 'recorded':
      return (
        <p role="status" data-testid="recorded" style={{ ...text, color: raw.color.signalPositive }}>
          {last.confirmation.complete
            ? 'Both sides confirmed. The order is now confirmed and will complete on the ledger.'
            : `Recorded. Waiting for ${last.confirmation.awaiting === 'buyer' ? 'the buyer' : 'the seller'} to confirm on their phone.`}
        </p>
      );
  }
}

function Panel({ testId, tone, children }: { testId: string; tone?: 'caution' | 'problem'; children: ReactNode }) {
  return (
    <section
      data-testid={testId}
      style={{
        display: 'grid',
        gap: raw.space.s3,
        padding: raw.space.s4,
        borderRadius: raw.radius.md,
        border: `1px solid ${tone === 'problem' ? raw.color.signalNegative : tone === 'caution' ? raw.color.signalCaution : raw.color.ink100}`,
      }}
    >
      {children}
    </section>
  );
}

function ReissueButton({ onReissue }: { onReissue: () => void }) {
  return (
    <button type="button" onClick={onReissue} style={{ ...confirmButton(false), justifySelf: 'start' }}>
      Reissue code and window
    </button>
  );
}

const text: CSSProperties = { margin: 0, fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary, lineHeight: 1.5 };
const muted: CSSProperties = { margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary };

const confirmButton = (disabled: boolean): CSSProperties => ({
  padding: `${raw.space.s3} ${raw.space.s5}`,
  borderRadius: raw.radius.sm,
  border: 'none',
  background: disabled ? raw.color.ink100 : tokens.action.default,
  color: disabled ? tokens.text.disabled : raw.color.paper,
  fontWeight: 700,
  fontFamily: raw.type.familyText,
  fontSize: '1rem',
  cursor: disabled ? 'not-allowed' : 'pointer',
});
