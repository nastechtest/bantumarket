import { describe, expect, it } from 'bun:test';
import { deviceNotice, devicePosture, requiresAcknowledgement } from './device-recognised.js';

const device = { deviceId: 'dev_console_01', firstSeenAt: '2026-09-22T09:00:00.000Z', recognised: true };
const now = '2026-10-22T09:00:00.000Z';

describe('device recognition', () => {
  it('reports history, not trust', () => {
    expect(devicePosture(device)).toBe('recognised');
    const notice = deviceNotice('recognised', now, device);
    expect(notice).toContain('has signed in before');
    expect(notice).not.toMatch(/verified|trusted|safe/i);
  });

  it('names a new browser and keeps the second factor mandatory', () => {
    const notice = deviceNotice('new', now, { ...device, recognised: false });
    expect(notice).toContain('has not signed in to the console before');
    expect(notice).toContain('second factor is still required');
    expect(requiresAcknowledgement('new')).toBe(true);
    expect(requiresAcknowledgement('recognised')).toBe(false);
  });

  it('never claims more than it knows when the device lookup fails', () => {
    expect(devicePosture(null)).toBe('unknown');
    expect(deviceNotice('unknown', now, null)).toContain('cannot be looked up');
    expect(deviceNotice('unknown', now, null)).toContain('second factor is still required');
  });

  it('wording never renders a confirmation affordance', () => {
    for (const posture of ['recognised', 'new', 'unknown'] as const) {
      expect(deviceNotice(posture, now, device).toLowerCase()).not.toContain('verified');
    }
  });
});
