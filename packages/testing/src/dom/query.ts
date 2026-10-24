import { accessibleNameOf, roleOf } from '../render.js';

/**
 * DOM queries for suites that need something `render()`'s built-in getters do not give: partial
 * matches, several roles at once, the tab order, or "which of these buttons is the primary one".
 *
 * The built-in getters on `RenderResult` throw with a message, which is what a normal test wants. The
 * functions here return arrays and never throw, because they are for assertions about the SET of
 * controls — "exactly one submit per form", "the tab order starts with the skip link" — where the
 * interesting failure is the shape of the list, not a missing node.
 *
 * Roles and names come from `render.tsx`, not from a second implementation: a query that disagrees
 * with the a11y audit about what an element is called is a harness bug, and the only fix that holds is
 * one function.
 */

export function allIn(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll('*'))];
}

export function byRole(root: Element, role: string): HTMLElement[] {
  return allIn(root).filter((el) => roleOf(el) === role) as HTMLElement[];
}

export function byAnyRole(root: Element, roles: readonly string[]): HTMLElement[] {
  return allIn(root).filter((el) => {
    const found = roleOf(el);
    return found !== null && roles.includes(found);
  }) as HTMLElement[];
}

/** Substring, case-insensitive, on the ACCESSIBLE name — not on raw textContent. */
export function byRoleNamed(root: Element, role: string, name: string | RegExp): HTMLElement[] {
  return byRole(root, role).filter((el) => {
    const label = accessibleNameOf(el);
    return typeof name === 'string' ? label.toLowerCase().includes(name.toLowerCase()) : name.test(label);
  });
}

export function byText(root: Element, text: string | RegExp): HTMLElement[] {
  return (allIn(root) as HTMLElement[]).filter((el) => {
    const own = Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (own === '') return false;
    return typeof text === 'string' ? own.toLowerCase().includes(text.toLowerCase()) : text.test(own);
  });
}

/**
 * The control a `<label>` actually points at — `for` first, then a wrapping label. Used to assert that
 * a field's label is wired rather than merely present somewhere on the page, which is the difference
 * between the a11y rule passing and the field being usable.
 */
export function controlForLabel(root: Element, labelText: string): HTMLElement | null {
  for (const label of Array.from(root.querySelectorAll('label'))) {
    const text = (label.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text.toLowerCase().includes(labelText.toLowerCase())) continue;
    const forId = label.getAttribute('for');
    if (forId !== null) {
      const target = root.ownerDocument.getElementById(forId);
      if (target !== null && root.contains(target)) return target as HTMLElement;
    }
    const inside = label.querySelector('input, select, textarea');
    if (inside !== null) return inside as HTMLElement;
  }
  return null;
}

/**
 * Tab order as a keyboard user meets it: focusable, not `tabindex="-1"`, sorted by positive tabindex
 * first (which is what the spec says browsers do) and then by document order.
 */
export function tabOrder(root: Element): HTMLElement[] {
  const focusable = allIn(root).filter(isTabbable) as HTMLElement[];
  const withIndex: Array<{ el: HTMLElement; index: number; order: number }> = focusable.map((el, order) => ({
    el,
    index: Number.parseInt(el.getAttribute('tabindex') ?? '0', 10) || 0,
    order,
  }));
  const positive = withIndex.filter((entry) => entry.index > 0).sort((a, b) => a.index - b.index || a.order - b.order);
  const rest = withIndex.filter((entry) => entry.index <= 0).sort((a, b) => a.order - b.order);
  return [...positive, ...rest].map((entry) => entry.el);
}

function isTabbable(el: Element): boolean {
  if (!(el instanceof el.ownerDocument.defaultView!.HTMLElement)) return false;
  const html = el as HTMLElement;
  if (html.hasAttribute('disabled') || html.closest('[inert]') !== null) return false;
  if (html.getAttribute('aria-hidden') === 'true') return false;
  const tabIndex = html.getAttribute('tabindex');
  if (tabIndex !== null) {
    const value = Number.parseInt(tabIndex, 10);
    if (Number.isNaN(value) || value < 0) return false;
    return true;
  }
  const tag = html.tagName;
  if (tag === 'A') return html.hasAttribute('href');
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SUMMARY') {
    const type = (html.getAttribute('type') ?? 'text').toLowerCase();
    return type !== 'hidden';
  }
  return false;
}

/** A one-line description of a node for an assertion message, without dumping the whole subtree. */
export function describe(el: Element): string {
  const attributes = Array.from(el.attributes)
    .filter((a) => a.name === 'id' || a.name === 'role' || a.name === 'type' || a.name.startsWith('aria-'))
    .map((a) => `${a.name}="${a.value}"`)
    .join(' ');
  const name = accessibleNameOf(el);
  const text = name === '' ? '' : ` name="${name}"`;
  return `<${el.tagName.toLowerCase()}${attributes === '' ? '' : ` ${attributes}`}>${text}`;
}

/** Elements matching `predicate`, walking the tree in document order. */
export function filter(root: Element, predicate: (el: Element) => boolean): HTMLElement[] {
  return allIn(root).filter(predicate) as HTMLElement[];
}

/** `true` when the node has non-whitespace text somewhere below it — the cheap "did it render?" test. */
export function hasContent(el: Element): boolean {
  return (el.textContent ?? '').trim() !== '' || el.querySelectorAll('img, input, canvas').length > 0;
}
