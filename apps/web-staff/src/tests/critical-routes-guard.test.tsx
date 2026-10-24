/**
 * The staff money screens have to refuse a visitor with no session, and the refusal has to come from
 * the shell rather than each page: `ConsoleRoot` hands `<App/>` to `ConsoleFrame` and the frame is the
 * only thing standing between an anonymous request and a payout screen. So these tests mount the real
 * route module as the frame's children — the exact shape production uses — and assert what the
 * unsigned operator can and cannot reach.
 *
 * `routes/PayoutOps.tsx` and friends are still placeholder screens. The assertions below are
 * therefore structural (no inputs, no record data, one refusal state) and not text matches against a
 * page that will be rewritten: when the real payout ops lands, this test keeps its meaning.
 */
import './dom.js';
import { beforeEach, describe, expect, it } from 'bun:test';
import type { ReactElement } from 'react';
import { ConsoleFrame } from '../layout/console-frame.js';
import Audit from '../routes/Audit.js';
import PayoutOps from '../routes/PayoutOps.js';
import Reconciliation from '../routes/Reconciliation.js';
import SignIn from '../routes/SignIn.js';
import { resetStaffSessionForTests } from '../shell/session-store.js';
import { mainTextOf, markup, parse } from './render.js';
import { NOW, tableRoute } from './fixtures.js';

beforeEach(() => {
  resetStaffSessionForTests();
});

/** Render `page` at `path` the way `ConsoleRoot` does, for a visitor with no session at all. */
function unsigned(path: string, page: ReactElement): string {
  return markup(
    <ConsoleFrame route={tableRoute(path)} session={null} now={NOW}>
      {page}
    </ConsoleFrame>,
  );
}

function mainOf(source: string): Element {
  const main = parse(source).querySelector('main');
  if (main === null) throw new Error('the shell rendered no main landmark');
  return main;
}

const REFUSAL_TITLE = 'Sign in to use the console';

describe('critical staff routes refuse a visitor with no session', () => {
  it('/payouts with no session shows the shell sign-in refusal and does not render the payout screen', () => {
    const source = unsigned('/payouts', <PayoutOps route={tableRoute('/payouts')} />);
    const main = mainOf(source);
    expect(main.querySelector('[data-state="signed-out"]')).not.toBeNull();
    expect(main.querySelector('h1')?.textContent).toBe(REFUSAL_TITLE);
    // No control an unsigned visitor could submit against the payout system.
    expect(main.querySelectorAll('input, button, form').length).toBe(0);
    expect(mainTextOf(source)).not.toContain('Payout ops');
    // And outside the main landmark either: the chrome must not confirm to an anonymous probe that
    // this URL is a critical staff screen.
    expect(source).not.toContain('Payout ops');
    expect(source).not.toContain('critical-chip');
  });

  it('/reconciliation with no session guards the ledger page behind the same refusal', () => {
    const source = unsigned('/reconciliation', <Reconciliation route={tableRoute('/reconciliation')} />);
    const main = mainOf(source);
    expect(main.querySelector('[data-state="signed-out"]')).not.toBeNull();
    expect(main.querySelector('h1')?.textContent).toBe(REFUSAL_TITLE);
    expect(main.querySelectorAll('input, button, form').length).toBe(0);
    expect(mainTextOf(source)).not.toContain('Reconciliation —');
  });

  it('/audit with no session refuses before the audit trail is rendered', () => {
    const source = unsigned('/audit', <Audit route={tableRoute('/audit')} />);
    const main = mainOf(source);
    expect(main.querySelector('[data-state="signed-out"]')).not.toBeNull();
    expect(main.querySelectorAll('input, button, form').length).toBe(0);
    expect(mainTextOf(source)).not.toContain('Audit trail —');
  });

  it('the no-session refusal is identical for all three money screens', () => {
    // Same copy for payouts, reconciliation and audit: the refusal cannot hint that one of them is
    // more reachable than another, and a staff member who lost their session gets one answer.
    const bodies = [
      mainTextOf(unsigned('/payouts', <PayoutOps route={tableRoute('/payouts')} />)),
      mainTextOf(unsigned('/reconciliation', <Reconciliation route={tableRoute('/reconciliation')} />)),
      mainTextOf(unsigned('/audit', <Audit route={tableRoute('/audit')} />)),
    ];
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect(bodies[0]).toContain(REFUSAL_TITLE);
  });

  it('/sign-in is the one critical route not refused for no session, and offers no signed-in screen', () => {
    // If sign-in itself were guarded there would be no way in, so this is the exception rather than a
    // hole: the credential step renders, and nothing that requires a session does.
    const source = unsigned('/sign-in', <SignIn route={tableRoute('/sign-in')} />);
    const main = mainOf(source);
    expect(main.querySelector('[data-state="signed-out"]')).toBeNull();
    expect(main.textContent).toContain('Staff sign in');
    expect([...main.querySelectorAll('input')].map((i) => i.getAttribute('id'))).toContain('staff-email');
    expect(mainTextOf(source)).not.toContain('Payout ops');
    expect(mainTextOf(source)).not.toContain('Audit trail');
  });
});
