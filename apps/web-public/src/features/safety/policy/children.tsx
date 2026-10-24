import { raw, tokens } from '@nastech/design-tokens';

/**
 * Children and this marketplace: an age floor, why it exists in South African terms, and what to
 * do when you find a listing, chat or profile that contradicts it. Deliberately short — this page
 * is a rule and a route, not a lecture.
 */

export function ChildrenPolicy() {
  return (
    <section
      className="safety-policy-children"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h2 style={{ marginTop: 0, fontFamily: raw.type.familyDisplay }}>Children on this platform</h2>
      <p>
        <strong>You must be 18 to open an account, list, buy, or agree to a handover.</strong> That
        is not copy-paste caution: a minor cannot validly conclude the contract a sale here creates,
        and the Children’s Act 38 of 2005 plus the credit agreements surrounding handset-and-device
        markets put the responsibility on the platform, not on the teenager.
      </p>
      <h3 style={{ fontSize: '1rem' }}>What that means in practice</h3>
      <ul style={{ paddingInlineStart: '1.2rem', fontSize: '0.92rem' }}>
        <li style={{ marginBottom: raw.space.s2 }}>
          The onboarding identity comparison is against an adult South African ID document or a
          passport; a child’s birth certificate does not open an account.
        </li>
        <li style={{ marginBottom: raw.space.s2 }}>
          Handovers are arranged by the account holder, in person. An adult collecting “for my son”
          with no account behind them is the pattern our handover screens warn buyers about, not a
          loophole.
        </li>
        <li>
          We do not knowingly profile, target or hold data of under-18s; if an account turns out to
          belong to a minor, it closes, the money trail is unwound through the refund path, and a
          guardian is contacted where contact details exist.
        </li>
      </ul>
      <h3 style={{ fontSize: '1rem' }}>If you think a seller or buyer is a child</h3>
      <p style={{ margin: 0, fontSize: '0.92rem' }}>
        Do not meet them. Stop the trade where it is (an unpaid order can be cancelled; a paid one
        goes through the dispute window). Then report it — the review queue treats “the person on
        the other side is a minor” as a safety report, not a policy curiosity, and the record goes
        to a human the same way any other would. The child’s account is not publicly named on any
        screen here; POPIA applies to minors too.
      </p>
    </section>
  );
}
