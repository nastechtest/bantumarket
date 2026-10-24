import { raw, tokens } from '@nastech/design-tokens';
import { TAP_TARGET_PX } from './breakpoints.js';

/**
 * The account control, two states, no fabricated session.
 *
 * Signed out it is a plain link to `/sign-in` — we do not render a "hi there" for someone we
 * cannot see. Signed in it is a `details` element, not a JS popover: it works with no scripts,
 * it is keyboard-operable for free, and the shell has no click-outside engine to trust.
 * `displayName` is whatever the session layer can honestly show; initials are derived here,
 * never a photo we cannot fetch at first paint.
 *
 * `onSignOut` is owned by the session layer. If it is not supplied we do not render a control
 * that looks like signing out and does nothing — a dead button in the account menu is a trust
 * bug, not a TODO.
 */

export interface AccountState {
  readonly signedIn: boolean;
  readonly displayName?: string;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const ACCOUNT_ITEMS = [
  { href: '/account', label: 'My account' },
  { href: '/account/orders', label: 'Orders' },
] as const;

export function AccountMenu({
  account,
  onSignOut,
}: {
  readonly account: AccountState;
  readonly onSignOut?: () => void;
}) {
  if (!account.signedIn) {
    return (
      <a
        href="/sign-in"
        className="nt-account-menu"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: raw.space.s2,
          padding: `${raw.space.s2} ${raw.space.s4}`,
          minHeight: `${TAP_TARGET_PX}px`,
          color: tokens.text.primary,
          textDecoration: 'none',
          fontFamily: raw.type.familyText,
          borderRadius: 'var(--nt-radius-pill)',
          border: `1px solid ${raw.color.ink100}`,
          boxSizing: 'border-box',
        }}
      >
        Sign in
      </a>
    );
  }

  const name = account.displayName ?? 'there';
  return (
    <details className="nt-account-menu" style={{ position: 'relative' }}>
      <summary
        aria-label={`Account menu for ${name}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: raw.space.s2,
          padding: raw.space.s2,
          minHeight: `${TAP_TARGET_PX}px`,
          cursor: 'pointer',
          listStyle: 'none',
          fontFamily: raw.type.familyText,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: tokens.surface.inverse,
            color: tokens.text.onInverse,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
          }}
        >
          {initialsOf(name)}
        </span>
        <span style={{ color: tokens.text.secondary, fontSize: '0.9rem' }}>{name.split(' ')[0]}</span>
      </summary>
      <div
        className="nt-account-menu__popover"
        style={{
          right: 0,
          top: '100%',
          marginTop: raw.space.s2,
          background: tokens.surface.primary,
          border: `1px solid ${raw.color.ink100}`,
          borderRadius: 'var(--nt-radius-md)',
          boxShadow: '0 8px 24px rgba(11, 13, 16, 0.12)',
          minWidth: 200,
          padding: raw.space.s2,
        }}
      >
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {ACCOUNT_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                style={{
                  display: 'block',
                  padding: `${raw.space.s3} ${raw.space.s4}`,
                  minHeight: TAP_TARGET_PX,
                  color: tokens.text.primary,
                  textDecoration: 'none',
                  fontFamily: raw.type.familyText,
                  borderRadius: 'var(--nt-radius-sm)',
                  boxSizing: 'border-box',
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        {onSignOut ? (
          <button
            type="button"
            onClick={onSignOut}
            style={{
              display: 'block',
              width: '100%',
              background: 'transparent',
              border: 0,
              textAlign: 'start',
              padding: `${raw.space.s3} ${raw.space.s4}`,
              color: tokens.text.secondary,
              textDecoration: 'underline',
              fontFamily: raw.type.familyText,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        ) : null}
      </div>
    </details>
  );
}
