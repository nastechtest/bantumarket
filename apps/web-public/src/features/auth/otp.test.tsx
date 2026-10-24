import { describe, expect, it } from 'bun:test';
import './test-dom.js';
import { OtpStep } from './otp-step.js';
import { createFakeAuthApi, FIXTURE_LIMITS, type FakeAuthHarness } from './api/fixtures.js';
import { byTestId, click, findButton, inputByLabel, mount, text, typeInto, type Mounted } from './test-dom.js';
import type { SessionInfo } from './api/auth-transport.js';
import { formatCountdown } from './resend-cooldown.js';

/**
 * Coverage the brief names, each one an actual interaction against the rendered screen:
 * wrong code, expired code, exhausted attempts, resend inside cooldown, code replayed after
 * success — plus the two meta-properties: no live OTP is anywhere in the DOM, and the client
 * does not fire a resend it has been told to wait for.
 */

const E164 = '+27820000111';

interface Setup {
  h: FakeAuthHarness;
  m: Mounted;
  verified: SessionInfo[];
  advance: (ms: number) => Promise<void>;
}

async function setup(resendAfterSec = FIXTURE_LIMITS.resendCooldownSec): Promise<Setup> {
  const h = createFakeAuthApi();
  const ticket = await h.api.requestOtp({ e164: E164 });
  const verified: SessionInfo[] = [];
  const ui = (
    <OtpStep
      api={h.api}
      e164={E164}
      sentToMasked={ticket.sentToMasked}
      otpId={ticket.otpId}
      resendAfterSec={resendAfterSec}
      onVerified={(s) => {
        verified.push(s);
      }}
      now={() => h.clock.now()}
    />
  );
  const m = mount(ui);
  await m.flush();
  return {
    h,
    m,
    verified,
    advance: async (ms) => {
      h.clock.advance(ms);
      await m.rerender(ui);
    },
  };
}

async function typeCode(m: Mounted, code: string): Promise<void> {
  await typeInto(inputByLabel(m.container, '6-digit code'), code);
  await click(findButton(m.container, 'Verify code'));
  await m.flush();
}

describe('otp-step', () => {
  it('shows the masked target and never the full number', async () => {
    const { m } = await setup();
    expect(text(m.container)).toContain('+27 82 ••• 11');
    expect(text(m.container)).not.toContain('27820000111');
    m.unmount();
  });

  it('wrong code: field error, attempts-left warning, no code echo', async () => {
    const { m, h } = await setup();
    await typeCode(m, '000000');
    expect(text(m.container)).toMatch(/does not match/i);
    expect(text(m.container)).toMatch(/4 attempts left/i);
    const live = h.outbox[0]!.code;
    expect(m.container.innerHTML).not.toContain(live);
    m.unmount();
  });

  it('right code: verifies, calls onVerified with the session, starts the session', async () => {
    const { m, h, verified } = await setup();
    await typeCode(m, h.outbox[0]!.code);
    expect(verified).toHaveLength(1);
    const s = await h.api.getSession();
    expect(s?.e164).toBe(E164);
    m.unmount();
  });

  it('expired code lands on an expired screen that offers a new code, not a retry of the dead one', async () => {
    const { m, h, advance } = await setup();
    await advance(FIXTURE_LIMITS.otpTtlMs + 1000); // code is now dead server-side
    await typeCode(m, h.outbox[0]!.code); // even typing the once-correct code
    expect(m.container.querySelector('[data-testid="otp-expired"]')).not.toBeNull();
    // And a resend after the cooldown mints a genuinely new code.
    await advance(FIXTURE_LIMITS.resendCooldownSec * 1000 + 500);
    await click(findButton(m.container, 'Resend code'));
    await m.flush();
    expect(h.outbox).toHaveLength(2);
    expect(h.outbox[1]!.code).not.toBe(h.outbox[0]!.code);
    m.unmount();
  });

  it('attempts exhausted is its own screen, and the correct code after exhaustion still does not pass', async () => {
    const { m, h } = await setup();
    const live = h.outbox[0]!.code;
    for (let i = 0; i < FIXTURE_LIMITS.maxVerifyAttempts; i++) {
      await typeCode(m, '111111');
    }
    expect(m.container.querySelector('[data-testid="otp-exhausted"]')).not.toBeNull();
    // The lock survives the right answer: no bypass by luck.
    await typeCode(m, live);
    expect(m.container.querySelector('[data-testid="otp-exhausted"]')).not.toBeNull();
    expect(m.container.innerHTML).not.toContain(live);
    m.unmount();
  });

  it('exhaustion then a fresh code works — the lock is on the code, not the person', async () => {
    const { m, h, advance, verified } = await setup();
    for (let i = 0; i < FIXTURE_LIMITS.maxVerifyAttempts; i++) await typeCode(m, '111111');
    await advance(FIXTURE_LIMITS.resendCooldownSec * 1000 + 500);
    await click(findButton(m.container, 'Send me a new code'));
    await m.flush();
    expect(h.outbox).toHaveLength(2);
    await typeCode(m, h.outbox[1]!.code);
    expect(verified).toHaveLength(1);
    m.unmount();
  });

  it('resend inside cooldown is refused without calling the transport', async () => {
    const { m, h } = await setup();
    const resend = byTestId(m.container, 'otp-resend') as HTMLButtonElement;
    expect(resend.disabled).toBe(true); // server said wait 30s; the button believes the server
    expect(text(m.container)).toMatch(/Resend code in 0:30/);
    await click(resend);
    expect(h.outbox).toHaveLength(1); // no second SMS was even attempted
    m.unmount();
  });

  it('resend becomes available after the cooldown and actually sends', async () => {
    const { m, h, advance } = await setup();
    await advance(FIXTURE_LIMITS.resendCooldownSec * 1000 + 500);
    await click(byTestId(m.container, 'otp-resend'));
    await m.flush();
    expect(h.outbox).toHaveLength(2);
    m.unmount();
  });

  it('a code replayed after success cannot mint a second session', async () => {
    const { m, h, verified } = await setup();
    const live = h.outbox[0]!.code;
    await typeCode(m, live);
    expect(verified).toHaveLength(1);
    // The screen is still mounted (parent decides navigation); replaying the same code must not
    // authenticate again. It reads as expired — both are dead tickets and the UI must not say
    // which one you used, to whoever is watching the responses.
    await typeCode(m, live);
    expect(verified).toHaveLength(1);
    expect(m.container.querySelector('[data-testid="otp-expired"]')).not.toBeNull();
    const list = await h.api.listSessions();
    expect(list).toHaveLength(1);
    m.unmount();
  });

  it('server rate limit shows the blocked screen with a live countdown', async () => {
    const { m, h, advance } = await setup();
    // Burn the send window: max sends per window, each after the cooldown clears.
    for (let i = 1; i < FIXTURE_LIMITS.maxSendsPerWindow; i++) {
      await advance(FIXTURE_LIMITS.resendCooldownSec * 1000 + 500);
      await click(byTestId(m.container, 'otp-resend'));
      await m.flush();
    }
    await advance(FIXTURE_LIMITS.resendCooldownSec * 1000 + 500);
    await click(byTestId(m.container, 'otp-resend'));
    await m.flush();
    expect(m.container.querySelector('[data-testid="otp-blocked"]')).not.toBeNull();
    const shown = text(byTestId(m.container, 'blocked-countdown'));
    expect(shown).toMatch(/^\d+:\d\d$/);
    // The countdown is consistent with the server's window, not a local guess: ~15 min from the
    // first send of the window minus the ~62s we advanced.
    expect(shown).toBe(
      formatCountdown(Math.ceil((h.outbox[0]!.sentAtMs + FIXTURE_LIMITS.sendWindowMs - h.clock.now()) / 1000)),
    );
    m.unmount();
  });

  it('short input is answered locally without burning an attempt', async () => {
    const { m, h } = await setup();
    await typeCode(m, '123');
    expect(text(m.container)).toMatch(/all 6 digits/i);
    const wrongAttempted = h.outbox; // still one send
    expect(wrongAttempted).toHaveLength(1);
    await typeCode(m, h.outbox[0]!.code); // the live code still works: no attempt was spent
    expect(m.container.querySelector('[data-testid="otp-step"]')).not.toBeNull();
    m.unmount();
  });

  it('no error path ever renders or echoes the live code', async () => {
    const { m, h } = await setup();
    const live = h.outbox[0]!.code;
    // A code that differs from the live one in the first digit, guaranteed.
    const wrong = `${(Number(live[0]) + 1) % 10}${live.slice(1)}`;
    await typeCode(m, '999999');
    await typeCode(m, wrong);
    expect(m.container.innerHTML).not.toContain(live);
    expect(m.container.textContent).not.toContain(live);
    m.unmount();
  });
});
