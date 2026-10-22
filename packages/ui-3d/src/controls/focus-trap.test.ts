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

import { createFocusTrap, escapeTargetAfter, focusablesIn, nextFocusable } from './focus-trap.js';

interface Fixture {
  readonly dom: Window & typeof globalThis;
  readonly host: HTMLElement;
  readonly after: HTMLElement;
}

/**
 * The viewer is a canvas plus its own controls, followed by the rest of the listing page. That shape
 * is the whole test: focus must circle the controls, never the pixel buffer, and Escape must hand it
 * to the page.
 */
function fixture(): Fixture {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <a id="before" href="#top">Back to search</a>
      <div id="viewer" tabindex="0">
        <canvas id="scene" tabindex="0" aria-label="Watch"></canvas>
        <button id="pose-one">Dial face</button>
        <button id="pose-two" disabled>Case back</button>
        <button id="pose-three">Crown</button>
        <input id="note" type="text">
      </div>
      <a id="after" href="/listing/1/condition">Read the condition report</a>
      <a id="after-two" href="/buy">Buy</a>
    </body></html>`,
  );
  const win = dom.window;
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    Event: win.Event,
    KeyboardEvent: win.KeyboardEvent,
  });
  return { dom: win, host: win.document.getElementById('viewer')!, after: win.document.getElementById('after')! };
}

const press = (el: HTMLElement, key: string, shift = false): Event => {
  const event = new (globalThis as unknown as { KeyboardEvent: typeof KeyboardEvent }).KeyboardEvent('keydown', {
    key,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return event;
};

const activeId = (): string | null => (document.activeElement instanceof HTMLElement ? document.activeElement.id : null);

describe('the ring', () => {
  test('is the viewer controls, and excludes the canvas and anything disabled', () => {
    const { host } = fixture();
    expect(focusablesIn(host).map((el) => el.id)).toEqual(['pose-one', 'pose-three', 'note']);
  });

  test('wraps forward and backward without escaping the viewer', () => {
    const { host } = fixture();
    const items = focusablesIn(host);
    const last = items[items.length - 1]!;
    expect(nextFocusable(items, last, false).target!.id).toBe('pose-one');
    expect(nextFocusable(items, items[0]!, true).target!.id).toBe('note');
    expect(nextFocusable(items, items[0]!, false).target!.id).toBe('pose-three');
  });

  test('an empty ring says leaving, because a trap with nothing in it is a wall', () => {
    fixture();
    const viewerOnlyCanvas = document.createElement('div');
    viewerOnlyCanvas.innerHTML = '<canvas tabindex="0"></canvas>';
    expect(focusablesIn(viewerOnlyCanvas)).toEqual([]);
    const step = nextFocusable(focusablesIn(viewerOnlyCanvas), null, false);
    expect(step.target).toBeNull();
    expect(step.leaving).toBe(true);
  });

  test('entering from outside lands on the first control, not the last', () => {
    const { host } = fixture();
    const items = focusablesIn(host);
    expect(nextFocusable(items, document.getElementById('before'), false).target!.id).toBe('pose-one');
    expect(nextFocusable(items, document.getElementById('before'), true).target!.id).toBe('note');
  });
});

describe('Tab and Escape, on a real DOM', () => {
  test('Tab moves focus through the controls and cycles at the end', () => {
    const { host } = fixture();
    const trap = createFocusTrap(host);
    trap.activate();
    document.getElementById('pose-one')!.focus();
    press(host, 'Tab');
    expect(activeId()).toBe('pose-three');
    press(host, 'Tab');
    expect(activeId()).toBe('note');
    press(host, 'Tab');
    expect(activeId()).toBe('pose-one');
    trap.deactivate();
  });

  test('Shift-Tab cycles backwards', () => {
    const { host } = fixture();
    const trap = createFocusTrap(host);
    trap.activate();
    document.getElementById('pose-one')!.focus();
    press(host, 'Tab', true);
    expect(activeId()).toBe('note');
    trap.deactivate();
  });

  test('Tab out of a text field closes the ring instead of leaking it', () => {
    const { host } = fixture();
    const trap = createFocusTrap(host);
    trap.activate();
    const input = document.getElementById('note')!;
    input.focus();
    const event = press(host, 'Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(activeId()).toBe('pose-one');
    // And the field is still escapable, which is the only way out of a closed ring.
    press(host, 'Escape');
    expect(activeId()).toBe('after');
    trap.deactivate();
  });

  test('Escape hands focus to the next real thing on the page and reports the leave', () => {
    const { host } = fixture();
    let left = 0;
    const trap = createFocusTrap(host, { onLeave: () => (left += 1) });
    trap.activate();
    document.getElementById('pose-three')!.focus();
    press(host, 'Escape');
    expect(activeId()).toBe('after');
    expect(left).toBe(1);
    trap.deactivate();
  });

  test('Escape with nothing after the viewer releases it instead of sealing it', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="v"><button id="b">x</button></div></body></html>');
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, KeyboardEvent: dom.window.KeyboardEvent, Event: dom.window.Event, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element });
    const host = dom.window.document.getElementById('v')!;
    let left = 0;
    const trap = createFocusTrap(host, { onLeave: () => (left += 1) });
    trap.activate();
    dom.window.document.getElementById('b')!.focus();
    host.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(dom.window.document.activeElement!.id).toBe('');
    expect(left).toBe(1);
    trap.deactivate();
  });

  test('an explicit escape target wins over document order', () => {
    const { host } = fixture();
    const trap = createFocusTrap(host, { escapeTo: document.getElementById('before') });
    trap.activate();
    document.getElementById('pose-one')!.focus();
    press(host, 'Escape');
    expect(activeId()).toBe('before');
    trap.deactivate();
  });

  test('Tab never lands on the canvas, and activating removes it from the page order too', () => {
    const { host } = fixture();
    const canvas = document.getElementById('scene')!;
    expect(canvas.getAttribute('tabindex')).toBe('0');
    const trap = createFocusTrap(host);
    trap.activate();
    expect(canvas.getAttribute('tabindex')).toBe('-1');
    document.getElementById('pose-three')!.focus();
    press(host, 'Tab');
    expect(activeId()).not.toBe('scene');
    press(host, 'Tab');
    expect(activeId()).not.toBe('scene');
    trap.deactivate();
  });

  test('a deactivated trap stops stealing keys', () => {
    const { host } = fixture();
    const trap = createFocusTrap(host);
    trap.activate();
    trap.deactivate();
    document.getElementById('before')!.focus();
    const event = press(host, 'Tab');
    expect(event.defaultPrevented).toBe(false);
    expect(activeId()).toBe('before');
  });
});

describe('escape target resolution', () => {
  test('is the element after the viewer, not the one before it', () => {
    const { host, after } = fixture();
    expect(escapeTargetAfter(host)!.id).toBe(after.id);
  });

  test('is null when the viewer is the last interactive thing on the page', () => {
    const dom = new JSDOM('<!doctype html><html><body><div id="v"><button id="b">x</button></div></body></html>');
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element });
    expect(escapeTargetAfter(dom.window.document.getElementById('v')!)).toBeNull();
  });

  test('a viewer whose controls render as siblings is still a ring', () => {
    const dom = new JSDOM(
      '<!doctype html><html><body><div id="wrap"><div id="v"><canvas id="c" tabindex="0"></canvas></div><div id="overlay"><button id="o1">a</button><button id="o2">b</button></div></div></body></html>',
    );
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element });
    const host = dom.window.document.getElementById('v')!;
    const items = focusablesIn(host);
    expect(items.map((el) => el.id)).toEqual(['o1', 'o2']);
    expect(items.length).toBeGreaterThan(0);
  });
});
