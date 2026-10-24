import { supportHref, type SupportContact } from '../lib/support.js';

/**
 * Help is a real destination or an honest absence. With a configured contact it is a tel/mailto
 * link; without one it says so rather than printing an address nobody reads.
 */
export function HelpSlot({ contact }: { readonly contact: SupportContact | null }) {
  return (
    <aside className="nt-help" aria-label="Seller help">
      <h2 className="nt-help__title">Need a person?</h2>
      {contact === null ? (
        <p className="nt-help__body">
          A support contact has not been configured yet. Nothing on this screen will be sent by
          email until it is.
        </p>
      ) : (
        <p className="nt-help__body">
          Questions about a listing, sale or payout?{' '}
          <a className="nt-help__link" href={supportHref(contact)}>
            {contact.kind === 'phone' ? `Call ${contact.display}` : `Email ${contact.display}`}
          </a>
          .
        </p>
      )}
    </aside>
  );
}
