import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

/**
 * Interaction test, in its own file because it installs jsdom globals — react-dom/client refuses
 * to run in a document-less environment, and renderToStaticMarkup tests elsewhere must not see
 * these globals bleed.
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const globals = globalThis as Record<string, unknown>;
globals['window'] = dom.window;
globals['document'] = dom.window.document;
for (const key of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment', 'getComputedStyle']) {
  globals[key] = (dom.window as unknown as Record<string, unknown>)[key];
}
Object.defineProperty(globals, 'navigator', { value: dom.window.navigator, configurable: true });
globals['IS_REACT_ACT_ENVIRONMENT'] = true;

const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ConditionCallout } = await import('./condition-callout.js');
const { FRONT_CAMERA, VIEWPORT_400, makeCaption } = await import('./overlay-fixtures.js');
const { projectPoint } = await import('./caption-projector.js');

function mount(caption: ReturnType<typeof makeCaption>) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(ConditionCallout, {
        caption,
        projection: projectPoint(caption.position, FRONT_CAMERA, VIEWPORT_400),
        claimScope: 'geometry_and_external_condition',
      }),
    );
  });
  return { container, root };
}

describe('ConditionCallout interaction', () => {
  test('click opens the disclosure text and marks the button expanded; click again closes it', () => {
    const { container, root } = mount(makeCaption('crystal', [0, 0, 0.02]));
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Crystal replaced');

    act(() => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Crystal replaced in 2024. Timekeeping not checked.');
    expect(container.textContent).toContain('disc-crystal');

    act(() => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Crystal replaced');
    act(() => root.unmount());
  });

  test('Escape closes an open disclosure — keyboard users are not trapped in the panel', () => {
    const { container, root } = mount(makeCaption('bezel', [0, 0, 0.02]));
    const button = container.querySelector('button')!;
    act(() => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Crystal replaced');
    act(() => {
      button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    act(() => root.unmount());
  });

  test('a caption with no disclosureId cannot be opened because it is not mounted', () => {
    const { container, root } = mount(makeCaption('orphan', [0, 0, 0.02], { disclosureId: '' }));
    expect(container.querySelector('button')).toBeNull();
    act(() => root.unmount());
  });
});
