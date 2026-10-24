import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installDom, type DomHandle } from './dom/env.js';
import { composeProviders, defaultProviders, type Provider } from './providers.js';
import type { Transport } from '@nastech/api-client';

/**
 * The single render entry point for every app and package suite.
 *
 * CONTRACT-GAP: the i18n and forms providers are being written concurrently this wave, so `render()`
 * does NOT build the full provider stack. It applies the harness defaults (tokens, optional fake
 * transport) and then the caller's `wrapper`/`providers` — the controller wires the real i18n/form
 * stack at integration by passing them here, and no suite needs to change when that happens.
 *
 * Why `act()` + `createRoot` instead of `@testing-library/react`: RTL registers a global `beforeAll`
 * for auto-cleanup, which `bun test` rejects outside a describe block — three packages worked around
 * it by setting `RTL_SKIP_AUTO_CLEANUP`, i.e. by remembering to unmount by hand. A harness that
 * requires remembering is how state leaks between suites, so the root is owned here and unmount is
 * guaranteed by `reset()`/`afterEach`.
 */

export interface RenderOptions {
  /** One wrapper component, e.g. a route stub or a theme boundary. */
  readonly wrapper?: Provider;
  /**
   * Several providers, outermost first. Use this for the real stack (`[I18nProvider, FormProvider]`)
   * once the controller wires it; `wrapper` and `providers` compose, `providers` outermost.
   */
  readonly providers?: readonly Provider[];
  /** Fake transport to publish through `useTransport()`; omit for static renders. */
  readonly transport?: Transport;
  /** Mount into a caller-owned element instead of a fresh container in `#root`. */
  readonly container?: HTMLElement;
}

export interface RenderResult {
  readonly container: HTMLElement;
  readonly baseElement: HTMLElement;
  /** Re-render the same tree in place — a NEW element, not the original props. */
  rerender(ui: ReactElement, options?: RenderOptions): void;
  unmount(): void;
  /** Every element the audit/query layer should see; `container` for most suites. */
  getByText(text: string): HTMLElement;
  queryAllByText(text: string): HTMLElement[];
  getByRole(role: string, name?: string): HTMLElement;
  getAllByRole(role: string): HTMLElement[];
  getByTestId(id: string): HTMLElement;
}

/**
 * Tracks live trees so a forgotten `unmount()` becomes an unmountable list rather than leaked React
 * state. `afterEach(cleanup)` is exported precisely so the one-line setup in a suite is the whole
 * cost of using the harness.
 */
const live: RenderResult[] = [];

function withProviders(ui: ReactNode, options: RenderOptions): ReactNode {
  const extras: Provider[] = [];
  if (options.wrapper !== undefined) extras.push(options.wrapper);
  if (options.providers !== undefined) extras.push(...options.providers);
  // Defaults first so they are OUTERMOST: an app provider must be able to override a token, not be
  // overridden by the harness.
  const stack = [...defaultProviders(options.transport), ...extras];
  return composeProviders(ui, stack) as ReactElement;
}

export function render(ui: ReactElement, options: RenderOptions = {}): RenderResult {
  const dom: DomHandle = installDom();
  const doc = dom.document;

  const container = options.container ?? doc.createElement('div');  if (options.container === undefined) {
    container.setAttribute('data-testing-container', 'true');
    dom.root().appendChild(container);
  }

  const root: Root = createRoot(container);
  // Suppress the "not wrapped in act" warning path by making every mutation go through act, and
  // silence React's console.error noise for expected-boundary tests via `renderWithConsoleSilenced`.
  act(() => {
    root.render(withProviders(ui, options));
  });

  const result: RenderResult = {
    container,
    baseElement: container,
    rerender(next: ReactElement, nextOptions?: RenderOptions) {
      const merged: RenderOptions = { ...options, ...nextOptions };
      act(() => {
        root.render(withProviders(next, merged));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      const index = live.indexOf(result);
      if (index >= 0) live.splice(index, 1);
      if (options.container === undefined) container.remove();
    },
    getByText: (text: string) => queryOneByText(container, text),
    queryAllByText: (text: string) => queryAllByText(container, text),
    getByRole: (role: string, name?: string) => queryOneByRole(container, role, name),
    getAllByRole: (role: string) => queryAllByRole(container, role),
    getByTestId: (id: string) => {
      const el = container.querySelector<HTMLElement>(`[data-testid="${CSS.escape(id)}"]`)
        ?? (container.matches(`[data-testid="${CSS.escape(id)}"]`) ? container : null);
      if (el === null) throw new Error(`testing/render: no element with data-testid="${id}"`);
      return el;
    },
  };

  live.push(result);
  return result;
}

/** Unmounts every tree created by `render()` since the last cleanup. Use in `afterEach`. */
export function cleanup(): void {
  for (const tree of live.splice(0)) {
    try {
      tree.unmount();
    } catch {
      // Already unmounted by the suite; cleanup must not turn a passing test red.
    }
  }
}

/** Number of mounted trees — a leak assertion for suites that forget `afterEach(cleanup)`. */
export function mountedCount(): number {
  return live.length;
}

function normalised(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function queryAllByText(container: HTMLElement, text: string): HTMLElement[] {
  const wanted = text.replace(/\s+/g, ' ').trim();
  const candidates = [container, ...Array.from(container.querySelectorAll<HTMLElement>('*'))];
  const matches = candidates.filter((el) => normalised(el) === wanted && el.textContent !== null);
  // Deepest-first semantics: a container holding `<p>Buy</p>` must not match on `Buy` too, or
  // "getByText" returns the wrapper and the assertion passes for the wrong node.
  return matches.filter((el) => !matches.some((other) => other !== el && other.contains(el)));
}

function queryOneByText(container: HTMLElement, text: string): HTMLElement {
  const found = queryAllByText(container, text);
  if (found.length === 0) throw new Error(`testing/render: no element with text "${text}"`);
  if (found.length > 1) {
    throw new Error(`testing/render: ${found.length} elements with text "${text}"; use queryAllByText`);
  }
  return found[0]!;
}

/**
 * Implicit roles for the tags this marketplace actually renders. Deliberately a small table: an
 * unlisted tag returns null rather than a guessed role, because a guessed role makes `getByRole`
 * assertions pass on markup no screen reader would announce that way.
 */
const IMPLICIT_ROLE: Readonly<Record<string, string>> = {
  a: 'link',
  article: 'article',
  aside: 'complementary',
  button: 'button',
  dialog: 'dialog',
  footer: 'contentinfo',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  img: 'img',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  p: 'paragraph',
  select: 'combobox',
  summary: 'summary',
  table: 'table',
  tbody: 'rowgroup',
  td: 'cell',
  textarea: 'textbox',
  ul: 'list',
};

/** INPUT needs a value-dependent role; keep that one branch out of the table so the table stays a plain vocabulary. */
function roleFor(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit !== null && explicit.trim() !== '') return explicit.trim().split(/\s+/)[0] ?? null;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (type === 'search') return 'searchbox';
    if (type === 'hidden') return null;
    return 'textbox';
  }
  return IMPLICIT_ROLE[tag] ?? null;
}

/** Public because the a11y rules and the app suites need the same role answer. */
export function roleOf(el: Element): string | null {
  return roleFor(el);
}

function queryAllByRole(container: HTMLElement, role: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
    if (roleFor(el) === role) out.push(el);
  }
  return out;
}

function queryOneByRole(container: HTMLElement, role: string, name: string | undefined): HTMLElement {
  const found = queryAllByRole(container, role).filter((el) =>
    name === undefined
      ? true
      : accessibleNameOf(el).replace(/\s+/g, ' ').trim() === name.replace(/\s+/g, ' ').trim(),
  );
  if (found.length === 0) {
    throw new Error(
      `testing/render: no element with role "${role}"${name === undefined ? '' : ` and name "${name}"`}`,
    );
  }
  if (found.length > 1) {
    throw new Error(`testing/render: ${found.length} elements with role "${role}"; narrow with a name`);
  }
  return found[0]!;
}

/**
 * The accessible name, computed the way the a11y rules need it (aria-label > aria-labelledby >
 * label > text). Kept here and re-used by `a11y/checks.ts` so a query and an audit can never
 * disagree about what an element is called.
 */
export function accessibleNameOf(el: Element): string {
  return computeName(el, new Set<Element>());
}

function computeName(el: Element, seen: Set<Element>): string {
  if (seen.has(el)) return '';
  seen.add(el);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const parts = labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => el.ownerDocument.getElementById(id))
      .filter((target): target is HTMLElement => target !== null)
      .map((target) => textContentOf(target, seen));
    const joined = parts.join(' ').trim();
    if (joined !== '') return joined;
  }

  const label = el.getAttribute('aria-label');
  if (label !== null && label.trim() !== '') return label.trim();

  const tag = el.tagName.toLowerCase();
  if (tag === 'img' || tag === 'area') {
    const alt = el.getAttribute('alt');
    return alt === null ? '' : alt.trim();
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const id = el.getAttribute('id');
    if (id !== null && id !== '') {
      const labelled = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelled !== null) return textContentOf(labelled, seen);
    }
    const wrapping = el.closest('label');
    if (wrapping !== null) return textContentOf(wrapping, seen);
    const value = (el as HTMLInputElement).value;
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'reset') {
      const attrValue = el.getAttribute('value');
      if (attrValue !== null && attrValue.trim() !== '') return attrValue.trim();
    }
    if (typeof value === 'string' && value.trim() !== '' && type !== 'password') return value.trim();
    const title = el.getAttribute('title');
    return title === null ? '' : title.trim();
  }
  if (tag === 'button' || tag === 'a' || tag === 'summary') {
    const text = textContentOf(el, seen);
    if (text !== '') return text;
    const title = el.getAttribute('title');
    return title === null ? '' : title.trim();
  }

  const own = textContentOf(el, seen);
  if (own !== '') return own;
  const title = el.getAttribute('title');
  return title === null ? '' : title.trim();
}

function textContentOf(el: Element, seen: Set<Element>): string {
  const out: string[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      out.push(child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== 1) continue;
    const asElement = child as Element;
    if (asElement.getAttribute('aria-hidden') === 'true') continue;
    out.push(computeName(asElement, seen));
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** `createElement` re-exported so `.tsx` suites need one fewer import. */
export { createElement as h };
export type { ReactElement, ReactNode };
