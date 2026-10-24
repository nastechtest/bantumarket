import '../../shell/test-dom.js';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { SessionTimeoutWatcher, sessionStatus, SESSION_WARNING_MS } from './session-timeout.js';

// Explicit, not ambient: RTL's auto-cleanup is switched off process-wide by `RTL_SKIP_AUTO_CLEANUP`
// (the ui-3d and inspect harnesses set it), and a watcher left mounted keeps ticking its countdown
// into every later act() in the run.
afterEach(cleanup);

const now = '2026-10-22T09:00:00.000Z';

describe('session status', () => {
  it('warns at two minutes and not a millisecond later', () => {
    expect(sessionStatus('2026-10-22T09:02:00.000Z', now).warning).toBe(true);
    expect(sessionStatus('2026-10-22T09:02:00.001Z', now).warning).toBe(false);
    expect(SESSION_WARNING_MS).toBe(120_000);
  });

  it('is expired exactly at the server expiry, not a local guess', () => {
    expect(sessionStatus('2026-10-22T09:00:00.000Z', now).expired).toBe(true);
    expect(sessionStatus('2026-10-22T09:00:00.001Z', now).expired).toBe(false);
  });

  it('clamps a clock running backwards without extending the session', () => {
    const early = sessionStatus('2026-10-22T09:10:00.000Z', '2026-10-22T08:55:00.000Z');
    expect(early.remainingMs).toBe(900_000);
    expect(early.expired).toBe(false);
  });
});

describe('SessionTimeoutWatcher', () => {
  it('renders children before expiry and the warning inside the window', () => {
    const view = render(
      <SessionTimeoutWatcher expiresAt="2026-10-22T09:01:00.000Z" clock={() => now} onExpire={() => undefined}>
        <p>The review panel</p>
      </SessionTimeoutWatcher>,
    );
    expect(view.getByText('The review panel')).toBeTruthy();
    expect(view.getByText(/This session ends in 1m 00s/)).toBeTruthy();
  });

  it('hard-stops at expiry: children are not rendered and the session-ended panel is', () => {
    const view = render(
      <SessionTimeoutWatcher expiresAt="2026-10-22T08:59:00.000Z" clock={() => now} onExpire={() => undefined}>
        <p>The review panel</p>
      </SessionTimeoutWatcher>,
    );
    expect(view.queryByText('The review panel')).toBeNull();
    expect(view.getByText('Session ended')).toBeTruthy();
  });

  it('calls onExpire once, which is what ends an impersonation session', () => {
    let expired = 0;
    render(
      <SessionTimeoutWatcher
        expiresAt="2026-10-22T08:59:00.000Z"
        clock={() => now}
        impersonating
        onExpire={() => {
          expired += 1;
        }}
      >
        <p>Support tools</p>
      </SessionTimeoutWatcher>,
    );
    expect(expired).toBe(1);
  });
});
