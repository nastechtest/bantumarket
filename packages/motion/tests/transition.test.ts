import { describe, expect, it } from 'bun:test';
import { crossfade, MAX_EXIT_MS } from '../src/use-transition-state.js';
import { durations } from '../src/tokens.js';

describe('route transition state machine (pure half)', () => {
  it('the new route key is active immediately, reduced motion or not — a transition never delays first paint', () => {
    expect(crossfade('/item', '/search', false).activeKey).toBe('/search');
    expect(crossfade('/item', '/search', true).activeKey).toBe('/search');
  });

  it('exit is capped at MAX_EXIT_MS and MAX_EXIT_MS is the quick duration', () => {
    expect(MAX_EXIT_MS).toBe(durations.quick);
    const c = crossfade('/checkout', '/handover', false);
    expect(c.exitMs).toBeLessThanOrEqual(MAX_EXIT_MS);
    expect(c.exitingKey).toBe('/checkout');
    expect(c.phase).toBe('enter');
  });

  it('reduced motion collapses choreography but still performs the swap (state change survives)', () => {
    const c = crossfade('/checkout', '/handover', true);
    expect(c.activeKey).toBe('/handover');
    expect(c.exitingKey).toBeNull();
    expect(c.enterMs).toBe(0);
    expect(c.exitMs).toBe(0);
    // Nothing says "stay on the old route while we figure it out" — the handover completing
    // is felt as an instant swap, not as silence.
    expect(c.phase).toBe('idle');
  });

  it('same-key navigation is a no-op state, not a re-triggered animation', () => {
    const c = crossfade('/search', '/search', false);
    expect(c.phase).toBe('idle');
    expect(c.exitingKey).toBeNull();
  });

  it('enter duration obeys the token ordering (uses standard, never scene — route changes are not scene loads)', () => {
    const c = crossfade('/a', '/b', false);
    expect(c.enterMs).toBe(durations.standard);
    expect(c.enterMs).toBeLessThan(durations.slow);
  });
});
