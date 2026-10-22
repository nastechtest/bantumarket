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
const { JSDOM } = (await import(jsdomSpecifier)) as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });

import type { ConditionCaption } from '@nastech/api-contracts';
import type { CameraPose } from './keyboard-rotate.js';
import {
  SEVERITY_WORDS,
  SPOKEN_CAPTION_LIMIT,
  announcementForPose,
  blockedText,
  captionText,
  createAnnouncer,
  framingText,
  type Scheduler,
} from './screen-reader-announcer.js';

const caption = (hotspotId: string, disclosureText: string, severity: ConditionCaption['severity']): ConditionCaption => ({
  hotspotId,
  position: [0, 0, 1],
  disclosureText,
  severity,
  disclosureId: `D-${hotspotId}`,
});

const pose = (label: string, captions: readonly ConditionCaption[]): CameraPose => ({
  id: label,
  label,
  azimuthDeg: 60,
  polarDeg: 75,
  hotspotIds: captions.map((c) => c.hotspotId),
  captions,
  row: 1,
  cell: 4,
});

const hairline = caption('h-flank-2', 'Hairline on the case flank, caught on a door frame', 'cosmetic');
const claspWear = caption('h-clasp', 'Clasp stretch: 2 links of wear', 'functional');
const chip = caption('h-bezel', 'Chip on the bezel at 9', 'unknown');

describe('announcement text', () => {
  test('a known caption set becomes the pose name plus its disclosure text', () => {
    const text = announcementForPose(pose('dial face, 2 o\'clock', [hairline]), { captioned: true, claimScope: 'geometry_and_external_condition' });
    expect(text).toBe('dial face, 2 o\'clock. Hairline on the case flank, caught on a door frame — cosmetic');
  });

  test('a captioned pose with two notes speaks both and a third is deferred, not swallowed', () => {
    const text = announcementForPose(pose('dial face, 2 o\'clock', [hairline, claspWear, chip]), {
      captioned: true,
      claimScope: 'geometry_and_external_condition',
    })!;
    expect(text).toContain(hairline.disclosureText);
    expect(text).toContain(claspWear.disclosureText);
    expect(text).toContain('1 more note in the condition list');
    expect(text).not.toContain(chip.disclosureText);
    expect(SPOKEN_CAPTION_LIMIT).toBe(2);
  });

  test('uncaptioned poses on a captioned capture are never announced', () => {
    expect(announcementForPose(pose('case flank, 4 o\'clock', []), { captioned: true, claimScope: 'geometry_and_external_condition' })).toBeNull();
  });

  test('a capture with no hotspots at all gets orientation, which is not a claim', () => {
    expect(announcementForPose(pose('dial face, 12 o\'clock', []), { captioned: false, claimScope: 'condition_only' })).toBe(
      'dial face, 12 o\'clock',
    );
  });

  test('a decorative model says nothing, because anything it says would be a claim', () => {
    expect(announcementForPose(pose('dial face, 12 o\'clock', [hairline]), { captioned: true, claimScope: 'none' })).toBeNull();
  });

  test('no announcement may imply a check that did not happen', () => {
    const forbidden = ['verified', 'authenticated', 'checked', 'genuine', 'guaranteed', 'inspected'];
    const texts = [
      announcementForPose(pose('dial face, 2 o\'clock', [hairline, claspWear, chip]), { captioned: true, claimScope: 'geometry_and_external_condition' }),
      announcementForPose(pose('case back, 6 o\'clock', [claspWear]), { captioned: true, claimScope: 'condition_only' }),
      framingText(1.75),
      blockedText({ axis: 'polar', direction: 1 }),
    ];
    for (const text of texts) {
      if (text === null) continue;
      for (const word of forbidden) expect(text.toLowerCase()).not.toContain(word);
    }
  });

  test('the three severities are named, including the one nobody likes', () => {
    expect(SEVERITY_WORDS.cosmetic).toBe('cosmetic');
    expect(captionText(chip)).toBe('Chip on the bezel at 9 — not assessed');
    expect(captionText(claspWear)).toBe('Clasp stretch: 2 links of wear — affects how it works');
  });

  test('a refused input says what was refused, in item words', () => {
    expect(blockedText({ axis: 'polar', direction: 1 })).toContain('under the case');
    expect(blockedText({ axis: 'polar', direction: -1 })).toContain('above the crystal');
    expect(blockedText({ axis: 'azimuth', direction: 1 })).toContain('edge of the photographs');
    expect(blockedText({ axis: 'zoom', direction: 1 })).toBe('closest the capture can show');
  });
});

describe('live region', () => {
  /** A scheduler the test controls, so "debounced" is an observed behaviour rather than a sleep. */
  const manualScheduler = (): { schedule: Scheduler; fire: () => void; pending: () => number } => {
    let queued: (() => void) | null = null;
    let count = 0;
    return {
      schedule: (task) => {
        queued = task;
        count += 1;
        return () => {
          queued = null;
        };
      },
      fire: () => queued?.(),
      pending: () => (queued ? 1 : 0),
    };
  };

  test('rapid pose changes coalesce into the last one', () => {
    const region = dom.window.document.createElement('p');
    const clock = manualScheduler();
    const announcer = createAnnouncer({ liveRegion: region, schedule: clock.schedule, delayMs: 220 });
    announcer.announce('dial face, 1 o\'clock');
    announcer.announce('dial face, 2 o\'clock');
    announcer.announce('case flank, 3 o\'clock');
    expect(region.textContent).toBe('');
    clock.fire();
    expect(region.textContent).toContain('case flank, 3 o\'clock');
  });

  test('a null announcement cancels the pending one instead of speaking it', () => {
    const region = dom.window.document.createElement('p');
    const clock = manualScheduler();
    const announcer = createAnnouncer({ liveRegion: region, schedule: clock.schedule });
    announcer.announce('dial face, 2 o\'clock');
    announcer.announce(null);
    expect(clock.pending()).toBe(0);
    clock.fire();
    expect(region.textContent).toBe('');
  });

  test('the same pose twice is still two announcements', () => {
    const region = dom.window.document.createElement('p');
    const clock = manualScheduler();
    const announcer = createAnnouncer({ liveRegion: region, schedule: clock.schedule });
    announcer.announce('dial face, 2 o\'clock');
    clock.fire();
    const first = region.textContent!;
    announcer.announce('dial face, 2 o\'clock');
    clock.fire();
    const second = region.textContent!;
    expect(first).not.toBe(second);
    expect(first.replace(/\u200B/g, '')).toBe(second.replace(/\u200B/g, ''));
  });

  test('flush delivers a pending line on the way out and text is set, never parsed', () => {
    const region = dom.window.document.createElement('p');
    const announcer = createAnnouncer({ liveRegion: region, schedule: () => () => undefined });
    announcer.announce('<img src=x onerror=alert(1)> — cosmetic');
    announcer.flush();
    expect(region.textContent).toContain('<img');
    expect(region.children.length).toBe(0);
  });

  test('a region that mounts after the first pose still receives it', () => {
    const clock = manualScheduler();
    const announcer = createAnnouncer({ schedule: clock.schedule });
    announcer.announce('dial face, 12 o\'clock');
    clock.fire();
    const region = dom.window.document.createElement('p');
    announcer.setLiveRegion(region);
    expect(region.textContent).toContain('dial face, 12 o\'clock');
  });

  test('cancel drops both the timer and the pending line', () => {
    const region = dom.window.document.createElement('p');
    const clock = manualScheduler();
    const announcer = createAnnouncer({ liveRegion: region, schedule: clock.schedule });
    announcer.announce('dial face, 2 o\'clock');
    announcer.cancel();
    clock.fire();
    announcer.flush();
    expect(region.textContent).toBe('');
  });
});

describe('framing', () => {
  test('a zoom is reported as framing, not as a condition fact', () => {
    expect(framingText(1.5)).toBe('framing 1.50 times');
    expect(framingText(2)).not.toContain('o\'clock');
  });
});
