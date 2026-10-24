import { VerificationBadge } from '@nastech/design-system';
import { firstNameOf, initialsOf } from '../lib/format.js';
import { authenticatedSeller, type SellerSessionState } from '../lib/session.js';

/**
 * Account control, one state at a time and none invented:
 *  - checking: says so, and does not offer sign-in to a seller who may already be signed in;
 *  - anonymous: a plain link to sign-in;
 *  - authenticated: name, tier badge and a real sign-out button.
 *
 * The tier badge is `VerificationBadge`, so the label comes from `TIER_LABELS`; this file never
 * writes a trust word of its own.
 */
export function AccountMenu({
  session,
  onSignOut,
}: {
  readonly session: SellerSessionState;
  readonly onSignOut: () => void;
}) {
  if (session.status === 'checking') {
    return (
      <span className="nt-account nt-account--checking" role="status">
        Checking session…
      </span>
    );
  }

  if (session.status === 'anonymous') {
    return (
      <a className="nt-account nt-account__signin" href="/sign-in">
        Sign in
      </a>
    );
  }

  const seller = authenticatedSeller(session);
  if (seller === null) return null;

  const first = firstNameOf(seller.displayName) ?? 'Seller';
  return (
    <details className="nt-account nt-account--signed-in">
      <summary className="nt-account__summary" aria-label={`Account menu for ${seller.displayName}`}>
        <span className="nt-account__avatar" aria-hidden="true">
          {initialsOf(seller.displayName)}
        </span>
        <span className="nt-account__name">{first}</span>
      </summary>
      <div className="nt-account__menu">
        <p className="nt-account__identity">
          <span className="nt-account__full-name">{seller.displayName}</span>
          <VerificationBadge tier={seller.tier} />
        </p>
        <p className="nt-account__note">
          Your tier describes checks on this seller account, not on any individual listing.
        </p>
        <button type="button" className="nt-account__signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </details>
  );
}
