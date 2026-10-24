import './dom.js';
import { describe, expect, it } from 'bun:test';
import { ConsoleFrame } from '../layout/console-frame.js';
import { classifyStatus, DENIED_MESSAGE, isDenied } from '../lib/api.js';
import { mainTextOf, markup, parse } from './render.js';
import { NOW, impersonatingSession, reviewerSession, routeAt, tableRoute } from './fixtures.js';

const PAGE_MARKER = 'DISPUTE CASE FILE BODY';

function deniedSource(path: string): string {
  return markup(
    <ConsoleFrame route={routeAt(path)} session={reviewerSession()} now={NOW}>
      <section>
        <h1>{PAGE_MARKER}</h1>
      </section>
    </ConsoleFrame>,
  );
}

describe('permission-denied copy', () => {
  it('names the missing capability and never renders the page it refuses', () => {
    const source = deniedSource('/disputes/case_known_0001');
    expect(source).toContain('Your role does not include this');
    expect(source).toContain('dispute.view');
    expect(source).toContain('Dispute resolver');
    expect(source).not.toContain(PAGE_MARKER);
  });

  it('is identical for a record that exists and one that does not', () => {
    const known = routeAt('/disputes/dispute_known_0001');
    const unknown = routeAt('/disputes/dispute_unknown_9999');
    // The route table resolves both to the same parameterised definition; the shell never receives
    // the concrete id, which is the structural reason the refusal cannot describe it.
    expect(known.path).toBe('/disputes/:id');
    expect(unknown.path).toBe(known.path);

    const knownSource = deniedSource('/disputes/dispute_known_0001');
    const unknownSource = deniedSource('/disputes/dispute_unknown_9999');
    expect(mainTextOf(knownSource)).toBe(mainTextOf(unknownSource));
    expect(knownSource).toBe(unknownSource);
    expect(knownSource).not.toContain('dispute_known_0001');
    expect(unknownSource).not.toContain('dispute_unknown_9999');
  });

  it('says out loud that existence is not confirmed', () => {
    const text = mainTextOf(deniedSource('/disputes/case_known_0001')).toLowerCase();
    expect(text).toContain('does not confirm whether the record you asked for exists');
    expect(text).not.toMatch(/not found|no such|does not exist|no record|404/);
  });

  it('keeps the refusal free of the requested record and of any link to it', () => {
    const host = parse(deniedSource('/disputes/case_known_0001'));
    const main = host.querySelector('main');
    expect(main?.textContent ?? '').not.toContain('/disputes');
    const hrefs = Array.from(main?.querySelectorAll('a') ?? []).map((anchor) => anchor.getAttribute('href') ?? '');
    expect(hrefs.some((href) => href.includes('case_known_0001'))).toBe(false);
    expect(hrefs).toEqual(['/disputes']);
  });

  it('does not let the impersonation refusal become an existence oracle either', () => {
    const source = markup(
      <ConsoleFrame route={tableRoute('/payouts')} session={impersonatingSession()} now={NOW}>
        <section>
          <h1>{PAGE_MARKER}</h1>
        </section>
      </ConsoleFrame>,
    );
    const text = mainTextOf(source).toLowerCase();
    expect(text).toContain('not available while impersonating');
    expect(text).not.toMatch(/not found|no such|does not exist|no record|404/);
  });
});

describe('the transport boundary collapses 401/403/404', () => {
  it('returns one denied outcome with one message for all three statuses', () => {
    const outcomes = [401, 403, 404].map((status) => {
      const { kind, message, retryAfterSeconds } = classifyStatus(status);
      return { kind, message, retryAfterSeconds };
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[1]).toEqual(outcomes[2]);
    expect(outcomes[2]?.kind).toBe('denied');
    expect(outcomes[2]?.message).toBe(DENIED_MESSAGE);
    expect(isDenied(classifyStatus(404))).toBe(true);
  });

  it('does not collapse a server fault into the permission message', () => {
    expect(classifyStatus(500).kind).toBe('error');
    expect(classifyStatus(500).message).not.toBe(DENIED_MESSAGE);
  });
});
