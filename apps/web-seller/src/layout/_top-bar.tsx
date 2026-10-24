import { AccountMenu } from './account-menu.js';
import { BrandMark } from './icons.js';
import type { SellerSessionState } from '../lib/session.js';

/**
 * The seller header. Brand is a link home; the account control owns signing out. No data is
 * fetched here — the header must render on the first frame of a data-queued phone.
 */
export function TopBar({
  session,
  onSignOut,
}: {
  readonly session: SellerSessionState;
  readonly onSignOut: () => void;
}) {
  return (
    <header className="nt-top-bar">
      <a className="nt-brand" href="/" aria-label="NasTech Market seller — dashboard">
        <BrandMark />
        <span className="nt-brand__name">NasTech Market</span>
        <span className="nt-brand__surface">Seller</span>
      </a>
      <span className="nt-top-bar__spacer" />
      <AccountMenu session={session} onSignOut={onSignOut} />
    </header>
  );
}
