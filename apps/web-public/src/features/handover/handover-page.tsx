import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { MoneyText } from '@nastech/design-system';
import type { RouteDef } from '../../router.js';
import type { HandoverTransport } from './api/handover-transport.js';
import { createFixtureHandoverTransport } from './api/fixtures.js';
import { useHandover } from './use-handover.js';
import { windowStatusLine } from '../../lib/window-validity.js';
import { Schedule } from './schedule.js';
import { ConfirmHandover } from './confirm-handover.js';
import { PhotoProof } from './photo-proof.js';
import { NotShown } from './not-shown.js';
import { Checklist } from './checklist.js';

/**
 * The handover screen: one page, ordered by what is at stake.
 *
 *   window (server clock) → confirm (the act) → proof (optional) → not-there (the exit)
 *
 * Anything a party might do that could strand money sits above anything informational. The
 * route param carries the order id (`/handover/:orderId`); everything else — venue, times,
 * states — comes from the transport, and every decision about time comes from the server's
 * instant in the responses, formatted SAST by `window-validity.ts`.
 */

export interface HandoverPageProps {
  readonly orderId: string;
  readonly role?: 'buyer' | 'seller';
  readonly transport?: HandoverTransport;
}

export function HandoverPage({ orderId, role = 'buyer', transport }: HandoverPageProps) {
  // Memoised: an unmemoised default transport would be a new object every render, retrigger the
  // hook's effect, and ping-pong the page forever.
  const active = useMemo(
    () => transport ?? createFixtureHandoverTransport({ scenario: 'open', orderId, actingRole: role }),
    [transport, orderId, role],
  );
  const h = useHandover(active, orderId);

  return (
    <section data-testid="handover-page" style={{ display: 'grid', gap: raw.space.s5, maxWidth: 640 }}>
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.5rem', color: tokens.text.primary }}>
          Handover
        </h1>
        <p style={{ margin: `${raw.space.s1} 0 0`, fontFamily: raw.type.familyText, fontSize: '0.875rem', color: tokens.text.secondary }}>
          Order {orderId} · you are viewing this as {role}. Both sides open this screen on their
          own phone at the meeting place.
        </p>
      </header>

      {h.load.kind === 'loading' ? <p aria-busy="true">Loading the exchange…</p> : null}
      {h.load.kind === 'failed' ? (
        <div role="alert" style={{ display: 'grid', gap: raw.space.s2 }}>
          <p style={{ margin: 0, color: raw.color.signalNegative, fontFamily: raw.type.familyText }}>{h.load.message}</p>
          <button type="button" onClick={h.reload} style={smallButton}>Try again</button>
        </div>
      ) : null}

      {h.load.kind === 'unscheduled' ? (
        <Schedule transport={active} orderId={orderId} orderPaid onScheduled={() => h.reload()} />
      ) : null}

      {h.load.kind === 'ready' ? (
        <>
          <WindowBar
            statusLine={h.windowView !== null ? windowStatusLine(h.windowView.evaluation) : ''}
            opens={h.windowView?.opens.label ?? '—'}
            expires={h.windowView?.expires.label ?? '—'}
            crosses={h.windowView?.crossesToNextDay ?? false}
            revoked={h.load.token.revoked}
          />

          {h.load.token.revoked ? (
            <p role="status" style={{ ...body, color: raw.color.signalCaution }}>
              This code was replaced by a newer one. Reissue below, or check the message NasTech sent you.
            </p>
          ) : null}

          {h.load.token.buyerConfirmed && h.load.token.sellerConfirmed ? (
            <section data-testid="handover-complete" role="status" style={{ ...panel, borderColor: raw.color.signalPositive }}>
              <h2 style={{ margin: 0, fontSize: '1.125rem', color: raw.color.signalPositive, fontFamily: raw.type.familyText }}>
                Both sides confirmed the exchange
              </h2>
              <p style={body}>
                The order is marked confirmed on the ledger. The held{' '}
                <MoneyText value={h.load.token.heldBuyerTotal} /> is released to the seller when the order
                completes — that is the ledger’s step, not a button on this screen.{' '}
                <a href={`/orders/${orderId}`} style={{ color: tokens.action.default, fontWeight: 600 }}>
                  See the order →
                </a>
              </p>
            </section>
          ) : (
            <>
              <ConfirmHandover
                token={h.load.token}
                role={role}
                windowView={h.windowView}
                busy={h.present.busy}
                last={h.present.last}
                onPresent={(pin) => void h.presentPin(pin)}
                onReissue={() => void h.reissue().catch(() => undefined)}
              />
              {h.pinOnce !== null ? <PinRevealInline pin={h.pinOnce} onDone={h.acknowledgePinShown} /> : null}

              <details style={{ fontFamily: raw.type.familyText }} data-testid="handover-extra">
                <summary style={{ fontWeight: 600, color: tokens.text.primary, cursor: 'pointer' }}>
                  At the meeting: what to bring, safety, and an optional photo
                </summary>
                <div style={{ display: 'grid', gap: raw.space.s4, marginTop: raw.space.s3 }}>
                  <Checklist role={role} />
                  <PhotoProof />
                </div>
              </details>

              <NotShown
                token={h.load.token}
                windowOpen={h.windowView !== null && h.windowView.evaluation.status !== 'expired'}
                onReport={h.reportNoShow}
              />
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

function WindowBar({ statusLine, opens, expires, crosses, revoked }: { statusLine: string; opens: string; expires: string; crosses: boolean; revoked: boolean }) {
  return (
    <section
      data-testid="window-bar"
      aria-label="Handover window"
      style={{
        display: 'grid',
        gap: raw.space.s1,
        padding: raw.space.s3,
        borderRadius: raw.radius.md,
        border: `1px solid ${revoked ? raw.color.ink100 : raw.color.accent600}`,
        fontFamily: raw.type.familyText,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: tokens.text.primary }}>{statusLine}</p>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>
        {crosses ? `Window spans midnight: opens ${opens}, ends ${expires} (next day).` : `Opens ${opens} — ends ${expires}.`}
      </p>
    </section>
  );
}

function PinRevealInline({ pin, onDone }: { pin: string; onDone: () => void }) {
  return (
    <section
      data-testid="pin-inline-reveal"
      style={{ ...panel, borderColor: tokens.action.default, display: 'grid', gap: raw.space.s2 }}
    >
      <p style={{ margin: 0, fontFamily: raw.type.familyMono, fontSize: '2rem', letterSpacing: '0.25em', color: tokens.text.primary }}>{pin}</p>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: tokens.text.secondary }}>
        Shown once, like the day it was booked. Losing it costs a reissue, never the money.
      </p>
      <button type="button" onClick={onDone} style={smallButton}>Got it</button>
    </section>
  );
}

/** The feature's route-level Page, per the wave-b contract. */
export function HandoverFeaturePage({ route }: { route: RouteDef }) {
  const pathname = typeof window === 'undefined' ? '/handover/ord_03' : window.location.pathname;
  const segs = pathname.split('/').filter((s) => s.length > 0);
  const orderId = route.path.includes(':') && segs.length > 1 ? decodeURIComponent(segs[1] ?? 'ord_03') : 'ord_03';
  return <HandoverPage orderId={orderId} />;
}

const body: CSSProperties = { margin: 0, fontFamily: raw.type.familyText, fontSize: '0.9375rem', color: tokens.text.primary, lineHeight: 1.55 };
const panel: CSSProperties = { display: 'grid', gap: raw.space.s2, padding: raw.space.s4, border: `1px solid ${raw.color.ink100}`, borderRadius: raw.radius.md };
const smallButton: CSSProperties = {
  justifySelf: 'start',
  padding: `${raw.space.s2} ${raw.space.s4}`,
  borderRadius: raw.radius.sm,
  border: `1px solid ${tokens.action.default}`,
  background: 'transparent',
  color: tokens.action.default,
  fontWeight: 600,
  fontFamily: raw.type.familyText,
  cursor: 'pointer',
};
