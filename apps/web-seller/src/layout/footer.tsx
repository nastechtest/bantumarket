import { HelpSlot } from './help-slot.js';
import { BrandMark } from './icons.js';
import type { SupportContact } from '../lib/support.js';

/** The seller shell's footer: what this surface is, where the numbers come from, and help. */
export function Footer({ support }: { readonly support: SupportContact | null }) {
  return (
    <footer className="nt-footer">
      <div className="nt-footer__identity">
        <BrandMark size={22} />
        <p className="nt-footer__line">
          <span className="nt-footer__brand">NasTech Market</span> seller workspace
        </p>
      </div>
      <p className="nt-footer__note">
        Amounts and order states shown here are read from the sale ledger. Nothing on this screen
        projects money that has not been written.
      </p>
      <HelpSlot contact={support} />
    </footer>
  );
}
