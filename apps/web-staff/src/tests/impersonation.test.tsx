import './dom.js';
import { describe, expect, it } from 'bun:test';
import type { StaffSession } from '../shell/session.js';
import { ConsoleFrame } from '../layout/console-frame.js';
import { countOf, markup, normalise, parse } from './render.js';
import { NOW, impersonatingSession, tableRoute } from './fixtures.js';

const PAGE_MARKER = 'PAYOUT LEDGER PAGE BODY';

function frame(path: string, session: StaffSession | null, now = NOW): string {
  return markup(
    <ConsoleFrame route={tableRoute(path)} session={session} now={now}>
      <section data-testid="page-body">
        <h1>{PAGE_MARKER}</h1>
      </section>
    </ConsoleFrame>,
  );
}

describe('impersonation closes every critical route', () => {
  for (const path of ['/payouts', '/reconciliation', '/audit'] as const) {
    it(`refuses ${path} for a support session that holds every capability`, () => {
      const session = impersonatingSession();
      const source = frame(path, session);

      // Three independent refusals, one per route: the page never mounts, the refusal is the
      // impersonation refusal (not a capability accident), and the banner remains visible.
      expect(source).not.toContain(PAGE_MARKER);
      expect(source).toContain('Not available while impersonating');
      expect(source).not.toContain('Your role does not include this');
      expect(source).toContain('data-testid="impersonation-banner"');
      expect(countOf(source, /<main\b/g)).toBe(1);
    });
  }

  it('still renders work routes while impersonating, so the refusal is scoped to critical class', () => {
    const source = frame('/disputes', impersonatingSession());
    expect(source).toContain(PAGE_MARKER);
    expect(source).toContain('data-testid="impersonation-banner"');
    expect(source).toContain('data-route-class="app"');
  });

  it('refuses the credential route as well, because /sign-in is declared critical', () => {
    const source = frame('/sign-in', impersonatingSession());
    expect(source).toContain('Not available while impersonating');
    expect(source).not.toContain(PAGE_MARKER);
  });

  it('closes the console when the impersonation window expires, before the staff session does', () => {
    const endedNow = '2026-10-22T11:00:00.000Z';
    const source = frame('/disputes', impersonatingSession(), endedNow);
    expect(source).toContain('Support session ended');
    expect(source).not.toContain(PAGE_MARKER);
    expect(parse(source).querySelector('[data-testid="impersonation-banner"]')?.getAttribute('data-state')).toBe('ended');
  });
});

describe('the impersonation banner', () => {
  it('names the operator, the target, the reason and the expiry, with no dismiss control', () => {
    const source = frame('/disputes', impersonatingSession());
    const banner = parse(source).querySelector<HTMLElement>('[data-testid="impersonation-banner"]');
    expect(banner).not.toBeNull();
    const text = normalise(banner?.textContent ?? '');
    expect(text).toContain('Naledi Khumalo');
    expect(text).toContain('Sipho Dlamini (buyer)');
    expect(text).toContain('Dispute evidence review');
    expect(text).toContain('Payouts, reconciliation and audit are closed');
    expect(banner?.querySelectorAll('button').length).toBe(0);
    expect(banner?.getAttribute('aria-live')).toBe('polite');
  });

  it('sits outside the main landmark so it survives every page it watches', () => {
    const source = frame('/disputes', impersonatingSession());
    expect(source.indexOf('impersonation-banner')).toBeLessThan(source.indexOf('<main'));
  });

  it('removes the critical destinations from the rail at the same moment', () => {
    const host = parse(frame('/disputes', impersonatingSession()));
    for (const path of ['/payouts', '/reconciliation', '/audit']) {
      expect(host.querySelector(`[data-nav-path="${path}"]`)).toBeNull();
    }
    expect(host.querySelector('[data-nav-path="/disputes"]')).not.toBeNull();
  });
});
