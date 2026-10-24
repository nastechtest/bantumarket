import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { installDom } from '@nastech/testing';
import { createPresence, PRESENCE_ENTER_CLASS, PRESENCE_EXIT_CLASS } from '../src/presence.js';
import { setReducedMotionOverride } from '../src/reduced-motion.js';

installDom();

afterEach(() => setReducedMotionOverride(null));
afterAll(() => setReducedMotionOverride(null));

function element(): HTMLElement {
  return document.createElement('div');
}

describe('presence helper', () => {
  it('enters, completes, then exits and leaves no classes', async () => {
    setReducedMotionOverride(false);
    const el = element();
    const presence = createPresence(el, { durationMs: 10 });

    const entering = presence.enter();
    expect(el.classList.contains(PRESENCE_ENTER_CLASS)).toBe(true);
    expect(presence.isAnimating()).toBe(true);
    expect(presence.phase()).toBe('entering');
    expect(await entering).toBe(true);
    expect(presence.isAnimating()).toBe(false);
    expect(el.className).toBe('');

    const exiting = presence.exit();
    expect(el.classList.contains(PRESENCE_EXIT_CLASS)).toBe(true);
    expect(presence.phase()).toBe('exiting');
    expect(await exiting).toBe(true);
    expect(presence.phase()).toBe('idle');
    expect(el.className).toBe('');
  });

  it('superseding a running enter resolves the old promise and swaps the class', async () => {
    setReducedMotionOverride(false);
    const el = element();
    const presence = createPresence(el, { durationMs: 50 });

    const entering = presence.enter();
    const exiting = presence.exit();
    expect(await entering).toBe(false);
    expect(el.classList.contains(PRESENCE_ENTER_CLASS)).toBe(false);
    expect(el.classList.contains(PRESENCE_EXIT_CLASS)).toBe(true);
    expect(await exiting).toBe(true);
    expect(el.className).toBe('');
  });

  it('with reduced motion resolves synchronously and adds no class', async () => {
    setReducedMotionOverride(true);
    const el = element();
    const presence = createPresence(el, { durationMs: 10 });

    const entering = presence.enter();
    // Synchronous observation, before awaiting: no class, no phase, no timer.
    expect(el.className).toBe('');
    expect(presence.isAnimating()).toBe(false);
    expect(presence.phase()).toBe('idle');
    expect(await entering).toBe(false);

    const exiting = presence.exit();
    expect(el.className).toBe('');
    expect(await exiting).toBe(false);
  });

  it('dispose cancels a window and clears the class', async () => {
    setReducedMotionOverride(false);
    const el = element();
    const presence = createPresence(el, { durationMs: 50 });
    const entering = presence.enter();
    presence.dispose();
    expect(await entering).toBe(false);
    expect(el.className).toBe('');
    expect(presence.phase()).toBe('idle');
  });
});
