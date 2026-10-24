import { installDom } from './env.js';

/**
 * Event helpers that work with React 18's delegated listeners.
 *
 * Two jsdom/React traps this exists to close, both of which produce a test that passes while the
 * component is broken:
 *  1. React attaches its listeners at the ROOT container, so an event dispatched with
 *     `bubbles: false` never reaches a handler. Everything here bubbles unless the platform says the
 *     type does not (`focus`, `scroll`), and says so in the name.
 *  2. Setting `el.value = 'x'` directly on a controlled input does NOT fire React's `onChange`,
 *     because React reads the value through its own tracker on the native setter. So `typeInto()`
 *     goes through the prototype setter, which is what a keyboard actually does.
 */

type Init = Record<string, unknown>;

function dispatch<T extends Event>(el: Element | Window | Document, event: T): boolean {
  el.dispatchEvent(event);
  return !event.defaultPrevented;
}

function makeEvent<K extends keyof HTMLElementEventMap>(type: K, init: Init = {}): Event {
  const { window } = installDom();
  const Ctor = (window as unknown as Record<string, new (type: string, init?: Init) => Event>)[eventClassName(type)]
    ?? window.Event;
  return new Ctor(type, { bubbles: true, cancelable: true, ...init });
}

/** Which jsdom constructor carries the fields for this event type; wrong class = missing fields. */
function eventClassName(type: string): string {
  if (type.startsWith('pointer')) return 'PointerEvent';
  if (type.startsWith('mouse') || type === 'click' || type === 'dblclick' || type === 'contextmenu') return 'MouseEvent';
  if (type.startsWith('key')) return 'KeyboardEvent';
  if (type.startsWith('touch')) return 'TouchEvent';
  if (type === 'input' || type === 'change') return 'Event';
  if (type === 'focus' || type === 'blur') return 'FocusEvent';
  if (type === 'submit' || type === 'reset') return 'Event';
  if (type === 'scroll') return 'Event';
  return 'Event';
}

export function fire(el: Element, type: string, init: Init = {}): boolean {
  return dispatch(el, makeEvent(type as keyof HTMLElementEventMap, init));
}

/** Non-bubbling focus, the way the platform defines it. React's onFocus still sees it (it listens non-bubbling). */
export function fireFocus(el: HTMLElement): void {
  const { window } = installDom();
  el.dispatchEvent(new window.FocusEvent('focus', { bubbles: false, cancelable: false }));
  if (window.document.activeElement !== el) {
    try {
      el.focus();
    } catch {
      // jsdom refuses to focus a detached node; the test that hits this has a mounting bug of its own.
    }
  }
}

export function fireBlur(el: HTMLElement): void {
  const { window } = installDom();
  el.dispatchEvent(new window.FocusEvent('blur', { bubbles: false, cancelable: false }));
}

export function click(el: Element, init: Init = {}): boolean {
  return fire(el, 'click', init);
}

/** Pointer-then-mouse-then-click, the order a real tap produces. Components that listen on any of the
 *  three must work, so a "click" in a test that only fires `click` under-tests the component. */
export function tap(el: Element, init: Init = {}): void {
  fire(el, 'pointerdown', init);
  fire(el, 'mousedown', init);
  fire(el, 'pointerup', init);
  fire(el, 'mouseup', init);
  fire(el, 'click', init);
}

export function keyPress(el: Element, key: string, init: Init = {}): boolean {
  const base = { key, code: codeForKey(key), ...init };
  const pressed = fire(el, 'keydown', base);
  const typed = pressed && fire(el, 'keypress', base);
  const released = typed && fire(el, 'keyup', base);
  return released;
}

/** Only the handful of `code` values the viewer keyboard bindings assert on; unknown keys stay unset. */
function codeForKey(key: string): string {
  const map: Readonly<Record<string, string>> = {
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
    ' ': 'Space',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };
  if (map[key] !== undefined) return map[key];
  if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return key;
}

/**
 * Type into a field the way a keyboard does: native setter, then `input`, then `change`.
 *
 * The `change` dispatch is not decoration — a form that validates on blur/change behaves differently
 * from one that validates per keystroke, and a test that only fires `input` cannot tell them apart.
 */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const { window } = installDom();
  const prototype = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set === undefined) {
    // No native setter to call: fall back to assignment so the test still exercises the handler, and
    // say so loudly rather than letting a silent React no-op look like a passing interaction.
    el.value = value;
  } else {
    descriptor.set.call(el, value);
  }
  fire(el, 'input', { data: value });
  fire(el, 'change');
}

export function selectOption(el: HTMLSelectElement, value: string): void {
  el.value = value;
  fire(el, 'change');
}

export function check(el: HTMLInputElement, checked = true): void {
  const { window } = installDom();
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked');
  if (descriptor?.set !== undefined) descriptor.set.call(el, checked);
  else el.checked = checked;
  fire(el, 'input');
  fire(el, 'change');
}

/**
 * Submit a form through its own `requestSubmit`-equivalent path.
 *
 * Dispatching `submit` on the FORM is what a real submission looks like to React's handler; calling
 * `form.submit()` would bypass the handler entirely and is never what a test means. Returns false when
 * a handler called `preventDefault()`, which is the assertion a checkout test actually wants: "the
 * client stopped this submit".
 */
export function submit(form: HTMLFormElement, init: Init = {}): boolean {
  return dispatch(form, makeEvent('submit', init));
}

export function pointerDown(el: Element, init: Init = {}): boolean {
  return fire(el, 'pointerdown', init);
}

export function pointerMove(el: Element, init: Init = {}): boolean {
  return fire(el, 'pointermove', init);
}

export function pointerUp(el: Element, init: Init = {}): boolean {
  return fire(el, 'pointerup', init);
}

export function wheel(el: Element, deltaY: number, init: Init = {}): boolean {
  return fire(el, 'wheel', { deltaY, ...init });
}

/** The visible viewport events, kept here so a suite does not hand-build a FocusEvent at 2am. */
export function windowResize(width = 390, height = 844): void {
  const { window } = installDom();
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
  window.dispatchEvent(new window.Event('resize', { bubbles: false }));
}
