const bunTestSpecifier = 'bun:test';
const bunTest = await import(bunTestSpecifier);
const { describe, test } = bunTest as {
  describe: (name: string, fn: () => void) => void;
  test: (name: string, fn: () => void | Promise<void>) => void;
};
/** `bun:test` ships no declarations in this workspace, and naming every matcher in a cast is how a
 *  test file stops compiling before it stops passing. The matcher object stays dynamic. */
const expect = bunTest.expect;

const jsdomSpecifier = 'jsdom';
const { JSDOM } = (await import(jsdomSpecifier)) as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis };
};
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const win = dom.window;
Object.assign(globalThis, {
  window: win,
  document: win.document,
  navigator: win.navigator,
  HTMLElement: win.HTMLElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  CustomEvent: win.CustomEvent,
  MouseEvent: win.MouseEvent,
  KeyboardEvent: win.KeyboardEvent,
  getComputedStyle: win.getComputedStyle.bind(win),
});
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });
// bun's runner rejects RTL's global beforeAll, so cleanup is explicit below.
process.env.RTL_SKIP_AUTO_CLEANUP = 'true';

const rtlSpecifier = '@testing-library/react';
const rtl = (await import(rtlSpecifier)) as typeof import('@testing-library/react');

import type { ConditionCaption } from '@nastech/api-contracts';
import { ControlsProvider } from './controls-provider.js';

const CLAIM = 'Shown from photographs of this item. Shows outer condition and shape only';

const hairline: ConditionCaption = {
  hotspotId: 'h-flank-2',
  position: [0.5, 0.02, 0.86],
  disclosureText: 'Hairline on the case flank, caught on a door frame',
  severity: 'cosmetic',
  disclosureId: 'D-118',
};
const clasp: ConditionCaption = {
  hotspotId: 'h-clasp',
  position: [0.1, -0.05, 0.9],
  disclosureText: 'Clasp stretch: two links',
  severity: 'functional',
  disclosureId: 'D-119',
};
/** A mark under the case, in a capture that never went under the case. */
const underCaseScar: ConditionCaption = {
  hotspotId: 'h-back-1',
  position: [0.2, -0.9, 0.35],
  disclosureText: 'Scratch across the case back',
  severity: 'cosmetic',
  disclosureId: 'D-120',
};

const GEOMETRY = { allowedAzimuthRange: [-90, 90] as const, allowedPolarRange: [40, 95] as const };

function mount(captions: readonly ConditionCaption[], claimScope?: 'none') {
  const tree = rtl.render(
    <ControlsProvider
      geometry={GEOMETRY}
      captions={captions}
      {...(claimScope ? { claimScope } : {})}
      sceneLabel="Watch inspection"
      announceDelayMs={0}
    >
      <canvas aria-label="Watch" data-3d-detached="true" />
    </ControlsProvider>,
  );
  const host = tree.container.querySelector<HTMLElement>('[data-role="viewer-host"]')!;
  const live = tree.container.querySelector<HTMLElement>('[aria-live="polite"]')!;
  const buttons = [...tree.container.querySelectorAll<HTMLButtonElement>('button')];
  return { ...tree, host, live, buttons };
}

describe('ControlsProvider', () => {
  test('gives every caption a control a keyboard can press', async () => {
    const { buttons, live, unmount } = mount([hairline, clasp]);
    const spoken = buttons.filter((b) => b.getAttribute('data-hotspot-ids'));
    const hotspotIds = spoken.map((b) => b.getAttribute('data-hotspot-ids') ?? '').join(' ');
    for (const caption of [hairline, clasp]) {
      expect(hotspotIds).toContain(caption.hotspotId);
    }
    const poseButton = spoken.find((b) => (b.getAttribute('data-hotspot-ids') ?? '').includes(hairline.hotspotId))!;
    rtl.fireEvent.click(poseButton);
    await rtl.waitFor(() => {
      expect(live.textContent ?? '').toContain(hairline.disclosureText);
    });
    // The severity is carried as the manifest's word, softened into plain English, never invented.
    expect(live.textContent ?? '').toContain('cosmetic');
    expect(live.textContent ?? '').toContain('affects how it works');
    unmount();
  });

  test('announces the pose the arrow keys moved to, in the same words the render shows', async () => {
    const { host, live, buttons, unmount } = mount([hairline, clasp]);
    expect(live.textContent ?? '').toBe('dial face, 12 o\'clock');
    rtl.fireEvent.keyDown(host, { key: 'ArrowRight' });
    await rtl.waitFor(() => {
      expect(live.textContent ?? '').toContain(hairline.disclosureText);
    });
    const spoken = live.textContent ?? '';
    expect(spoken).toContain('between 12 and 1 o\'clock');
    // The pressed button and the spoken line describe the same view — one state, two surfaces.
    const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(spoken).toContain(pressed[0]!.textContent ?? '');
    // An unmapped key is left to the page: no new sentence is spoken.
    const before = live.textContent ?? '';
    rtl.fireEvent.keyDown(host, { key: 'q' });
    await rtl.waitFor(() => {
      expect(live.textContent ?? '').toBe(before);
    });
    unmount();
  });

  test('refuses a pose the photographs do not contain and says why', async () => {
    const { host, live, unmount } = mount([hairline]);
    for (let i = 0; i < 6; i += 1) rtl.fireEvent.keyDown(host, { key: 'ArrowRight' });
    await rtl.waitFor(() => {
      expect(live.textContent ?? '').toContain('edge of the photographs');
    });
    unmount();
  });

  test('carries the claim scope as text, not as a badge', async () => {
    const { container, unmount } = mount([hairline]);
    const scope = container.querySelector<HTMLElement>('[data-role="claim-scope"]')!;
    expect(scope.textContent ?? '').toContain(CLAIM);
    expect((scope.textContent ?? '').toLowerCase()).not.toContain('verified');
    unmount();
  });

  test('says nothing when there is nothing to say, and never for a decorative model', async () => {
    const { host, live, container, unmount } = mount([]);
    // No captions: orientation only, and no disclosure sentence invented out of geometry.
    expect((live.textContent ?? '').toLowerCase()).not.toContain('hairline');
    rtl.fireEvent.keyDown(host, { key: 'ArrowRight' });
    await rtl.waitFor(() => {
      expect(live.textContent ?? '').not.toBe('');
    });
    expect(live.textContent ?? '').not.toContain('—');
    unmount();

    const quiet = mount([hairline], 'none');
    rtl.fireEvent.keyDown(quiet.host, { key: 'ArrowRight' });
    await rtl.waitFor(() => {
      expect(quiet.live.textContent ?? '').not.toContain(hairline.disclosureText);
    });
    expect(quiet.container.querySelector('[data-role="claim-scope"]')!.textContent ?? '').toContain('This model is decorative');
    quiet.unmount();
  });

  test('names a caption the capture cannot show instead of hiding it', async () => {
    const { container, unmount } = mount([hairline, underCaseScar]);
    const note = container.querySelector<HTMLElement>('[data-role="unreachable"]')!;
    expect(note.textContent ?? '').toContain('1 condition note');
    const hotspotIds = [...container.querySelectorAll('button')]
      .map((b) => b.getAttribute('data-hotspot-ids') ?? '')
      .join(' ');
    expect(hotspotIds).not.toContain(underCaseScar.hotspotId);
    unmount();
  });
});
