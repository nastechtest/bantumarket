import { useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { SafetyTransport } from '../api/safety-transport.js';

export interface SellerRef {
  readonly accountId: string;
  readonly displayName: string;
}

/**
 * Mute is real suppression on the buyer's surface, and the button copy says exactly what stops:
 * listings hidden from search, category pages and saved-search alerts; messages from the seller
 * refused at delivery — the sender sees "could not deliver" — so this is not a preference toggle
 * the other side never notices. What mute is NOT: it does not hide the seller from anybody else,
 * and it is not the platform judging them. If something should come down for everyone, that is a
 * report, not a mute.
 */
export function MuteSellerButton({
  transport,
  seller,
  muted: initialMuted = false,
  onChanged,
}: {
  readonly transport: SafetyTransport;
  readonly seller: SellerRef;
  readonly muted?: boolean;
  readonly onChanged?: (muted: boolean) => void;
}) {
  const [muted, setMuted] = useState(initialMuted);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const action = muted
      ? transport.unmuteSeller(seller.accountId)
      : transport.muteSeller(seller.accountId, seller.displayName).then(() => undefined);
    action
      .then(() => {
        const next = !muted;
        setMuted(next);
        onChanged?.(next);
      })
      .catch(() => setError('That did not save — the mute list could not be reached. Try again.'))
      .finally(() => setPending(false));
  };

  return (
    <span className="safety-mute-seller" style={{ fontFamily: raw.type.familyText }}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={muted}
        data-testid={`mute-${seller.accountId}`}
        style={{
          padding: `${raw.space.s2} ${raw.space.s4}`,
          border: `1px solid ${muted ? raw.color.accent600 : raw.color.ink100}`,
          borderRadius: raw.radius.md,
          background: muted ? raw.color.paperWarm : tokens.surface.primary,
          color: muted ? raw.color.accent900 : tokens.text.primary,
        }}
      >
        {pending
          ? 'Saving…'
          : muted
            ? `Unmute ${seller.displayName}`
            : `Mute ${seller.displayName}`}
      </button>
      <p style={{ margin: `${raw.space.s2} 0 0`, fontSize: '0.82rem', color: tokens.text.secondary, maxWidth: '46ch' }}>
        {muted ? (
          <>
            {seller.displayName}’s listings are hidden from your search results, category pages and
            saved-search alerts, and messages they send you are refused at delivery — they see
            “could not deliver”. They are not told who muted them. Unmute at any time.
          </>
        ) : (
          <>
            Muting hides this seller from <em>your</em> view and refuses their messages to you at
            delivery. It does not hide them from anyone else, and it is not a judgement by the
            platform — if the listing itself breaks the rules,{' '}
            <a href="/safety/report">report it</a> instead.
          </>
        )}
      </p>
      {error ? (
        <p role="alert" style={{ color: raw.color.signalNegative, fontSize: '0.85rem' }}>
          {error}
        </p>
      ) : null}
    </span>
  );
}
