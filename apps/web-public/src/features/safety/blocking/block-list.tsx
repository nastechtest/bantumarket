import { useEffect, useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { MutedSeller, SafetyTransport } from '../api/safety-transport.js';

/**
 * The buyer's mute list. Plain rows, one removal button each, and a standing reminder of what a
 * mute does and does not do — this page is where someone checks whether the thing they half-clicked
 * last week is actually hiding anyone.
 */
export function BlockList({ transport }: { readonly transport: SafetyTransport }) {
  const [mutes, setMutes] = useState<readonly MutedSeller[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    transport
      .listMutes()
      .then((m) => {
        if (live) setMutes(m);
      })
      .catch(() => {
        if (live) setError('The mute list could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, [transport]);

  const remove = (sellerAccountId: string) => {
    transport
      .unmuteSeller(sellerAccountId)
      .then(() => transport.listMutes())
      .then((m) => setMutes(m))
      .catch(() => setError('That unmute did not save. Try again.'));
  };

  return (
    <section
      className="safety-block-list"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ marginTop: 0 }}>Sellers you have muted</h2>
      {error ? (
        <p role="alert" style={{ color: raw.color.signalNegative }}>
          {error}
        </p>
      ) : null}
      {mutes === null ? (
        !error ? (
          <p style={{ color: tokens.text.secondary }}>Loading your mute list…</p>
        ) : null
      ) : mutes.length === 0 ? (
        <p>
          Nobody yet. A mute hides one seller’s listings from your views and refuses their messages
          to you at delivery; the seller is not named-told, but a “could not deliver” notice will
          reach them. It changes nothing about their account for anybody else.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {mutes.map((m) => (
            <li
              key={m.sellerAccountId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: raw.space.s3,
                alignItems: 'baseline',
                borderTop: `1px solid ${raw.color.ink100}`,
                padding: `${raw.space.s3} 0`,
              }}
            >
              <span>
                <strong>{m.displayName}</strong>
                <span style={{ display: 'block', fontSize: '0.8rem', color: tokens.text.disabled }}>
                  muted{' '}
                  {new Date(m.mutedAt).toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </span>
              <button type="button" onClick={() => remove(m.sellerAccountId)} data-testid={`unmute-${m.sellerAccountId}`}>
                Unmute
              </button>
            </li>
          ))}
        </ul>
      )}
      <p style={{ fontSize: '0.85rem', color: tokens.text.secondary }}>
        Mutes live on your account and follow you to any device. If a seller is breaking the rules
        rather than just unwanted, mute is not enough —{' '}
        <a href="/safety/report">send it to the review queue</a>.
      </p>
    </section>
  );
}
