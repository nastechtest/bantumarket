import { useState } from 'react';
import { VerificationBadge } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDateTime } from '../../lib/dates.js';
import { Note, Panel } from '../../ui/primitives.js';

const SELLER = {
  displayName: 'Pieter van Wyk',
  handle: '@pieter.vw',
  email: 'p•••@nastech.market',
  tier: 'T2' as const,
  joinedAt: '2026-09-20T08:00:00+02:00',
};

const BANK = {
  destination: 'FNB Business •••• 4821',
  holder: 'P. van Wyk',
  confirmedAt: '2026-09-22T11:40:00+02:00',
};

type NotificationKey = 'questions' | 'sales' | 'payouts' | 'reviews';

const NOTIFICATION_COPY: Readonly<Record<NotificationKey, string>> = {
  questions: 'A buyer asks a question about one of my listings.',
  sales: 'A buyer pays for a listing.',
  payouts: 'A payout is sent or returned by the bank.',
  reviews: 'A reviewer makes a decision on a listing.',
};

export function SettingsPage() {
  const [trustedDevice, setTrustedDevice] = useState(true);
  const [notifications, setNotifications] = useState<Readonly<Record<NotificationKey, boolean>>>({
    questions: true,
    sales: true,
    payouts: true,
    reviews: false,
  });
  const [area, setArea] = useState('Cape Town city bowl');
  const [saved, setSaved] = useState(false);

  function toggle(key: NotificationKey) {
    setNotifications((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Settings"
        eyebrow="Your account"
        description="Your seller details, how you sign in, where payouts go and what we may email you about."
      />

      {saved ? <Note tone="success" title="Preferences saved">Changes apply to this seller account immediately.</Note> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <Panel title="Seller profile" id="settings-profile">
          <dl style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <dt style={{ color: tokens.text.secondary, fontSize: '0.875rem' }}>Name</dt>
              <dd style={{ margin: 0 }}>{SELLER.displayName}</dd>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <dt style={{ color: tokens.text.secondary, fontSize: '0.875rem' }}>Public handle</dt>
              <dd style={{ margin: 0 }}>{SELLER.handle}</dd>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <dt style={{ color: tokens.text.secondary, fontSize: '0.875rem' }}>Email</dt>
              <dd style={{ margin: 0 }}>{SELLER.email}</dd>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <dt style={{ color: tokens.text.secondary, fontSize: '0.875rem' }}>Seller tier</dt>
              <dd style={{ margin: 0 }}>
                <VerificationBadge tier={SELLER.tier} />
              </dd>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <dt style={{ color: tokens.text.secondary, fontSize: '0.875rem' }}>Joined</dt>
              <dd style={{ margin: 0 }}>{sastDateTime(SELLER.joinedAt)}</dd>
            </div>
          </dl>
          <Note>
            Your handle is what buyers see. Your email and phone number are not shown on a listing or in a conversation.
          </Note>
        </Panel>

        <Panel title="Sign-in and devices" description="There is no password. Each sign-in sends a six-digit code." id="settings-devices">
          {trustedDevice ? (
            <>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                This device is remembered for 30 days. That is a token on this device, not proof of who you are.
              </p>
              <button type="button" className="secondary" onClick={() => setTrustedDevice(false)}>
                Remove this device
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                This device is no longer remembered. The next visit asks for a six-digit code.
              </p>
              <button type="button" onClick={() => setTrustedDevice(true)}>
                Remember this device again
              </button>
            </>
          )}
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            Removing a device does not sign out other devices. Use the account menu to sign out of this one.
          </p>
        </Panel>

        <Panel title="Bank account" description="Payouts go to this account. Only the last four digits are shown." id="settings-bank">
          <p style={{ margin: 0, fontWeight: 600 }}>{BANK.destination}</p>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>
            {BANK.holder} · confirmed {sastDateTime(BANK.confirmedAt)}
          </p>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>
            The full account number is held by the payment provider and is never shown again after it is saved.
          </p>
          <a href="/payouts">Update bank details on the payouts screen</a>
        </Panel>

        <Panel title="Default handover area" description="The area a buyer sees when you propose a meeting place." id="settings-handover">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem', fontWeight: 600 }}>
            Area
            <select
              value={area}
              onChange={(event) => {
                setArea(event.target.value);
                setSaved(false);
              }}
              style={{ minHeight: '44px', padding: '8px 10px', border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, font: 'inherit' }}
            >
              <option>Cape Town city bowl</option>
              <option>Atlantic Seaboard</option>
              <option>Southern Suburbs</option>
              <option>Northern Suburbs</option>
              <option>Stellenbosch</option>
            </select>
          </label>
          <button type="button" onClick={() => setSaved(true)}>
            Save handover area
          </button>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            Never use a home address. Public places such as a mall information desk or a coffee shop are safer for both sides.
          </p>
        </Panel>

        <Panel title="Email notifications" description="Only the messages that need a seller decision." id="settings-notifications">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(Object.keys(NOTIFICATION_COPY) as NotificationKey[]).map((key) => (
              <li key={key}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: '44px', paddingTop: 6 }}>
                  <input type="checkbox" checked={notifications[key]} onChange={() => { toggle(key); setSaved(false); }} />
                  <span style={{ fontSize: '0.9rem', lineHeight: 1.45 }}>{NOTIFICATION_COPY[key]}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setSaved(true)}>
            Save notification choices
          </button>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            Security messages about a bank change are always sent, even when these are switched off.
          </p>
        </Panel>

        <Panel title="Your data" description="What you can take with you." id="settings-data">
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>
            You can request a copy of your listings, sales and messages. A request is prepared offline and sent to {SELLER.email};
            it is not generated immediately.
          </p>
          <button type="button" className="secondary" onClick={() => setSaved(true)}>
            Request my data
          </button>
          <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
            To close your account, message support from the help link in the footer. Open orders must be completed or cancelled
            first.
          </p>
        </Panel>
      </div>
    </div>
  );
}
