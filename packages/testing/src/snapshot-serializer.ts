import { installDom } from './dom/env.js';

/**
 * A stable DOM serializer for `toMatchSnapshot()`.
 *
 * Bun snapshots the raw value it is given, so `container.innerHTML` as a snapshot fails on the third
 * render for three reasons none of them product bugs: React's `useId` values (`:r1:`) change with
 * mount order, attribute order changes with prop spread order, and every transient timer or signed URL
 * in the tree differs from run to run. A serializer that does not normalise those produces a suite
 * people regenerate by hand, which is a snapshot suite that has stopped asserting anything.
 *
 * What it normalises, and what it refuses to:
 *  - ids matching React's `useId` shape are replaced with `:rN:` in first-appearance order;
 *  - attributes are sorted, so spread order is not a diff;
 *  - values matching a redaction rule (signed URLs, bearer tokens, ids the caller names) become
 *    `<redacted>`, because a committed snapshot of a signed URL is a committed secret;
 *  - it does NOT strip class/style/aria: this product's accessibility contract and its token usage
 *    live in exactly those attributes, and a serializer that hides them hides the regressions.
 */

export interface SerializeOptions {
  /** Extra value patterns redacted wherever they appear, by name so the diff says which rule fired. */
  readonly redact?: Readonly<Record<string, RegExp>>;
  /** Attribute names whose VALUES are dropped entirely (the attribute stays, marked `="…"`). */
  readonly dropAttributes?: readonly string[];
  /** Element ids to replace wholesale — a `<slot>` you never want in the snapshot. */
  readonly ignoreElements?: readonly string[];
  /** Collapse nested DOM to a single `<name …/>` line — for subtrees owned by another suite. */
  readonly opaque?: readonly string[];
  /** Indent; default two spaces. */
  readonly indent?: number;
}

const DEFAULT_REDACT: Readonly<Record<string, RegExp>> = {
  // Signed-URL material, the same shapes `api-client/src/media.ts` caches and `errors.ts` refuses to log.
  signedUrl: /[?&](?:X-Amz-Signature|signature|token|policy)=[^&\s"]+/i,
  bearer: /Bearer\s+\S+/,
  idLike: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
};

/** React 18 `useId` shape: `:r0:`, `:r1a:`, `«r0»` in some renders. */
const REACT_ID = /(^|:)(r[0-9]+|[a-z]{0,4}[0-9]{1,3})(:|$)/;

export function createSerializer(options: SerializeOptions = {}): (node: Element | DocumentFragment) => string {
  const redactRules = { ...DEFAULT_REDACT, ...(options.redact ?? {}) };
  const dropped = new Set(options.dropAttributes ?? []);
  const ignored = new Set(options.ignoreElements ?? []);
  const opaque = new Set(options.opaque ?? []);
  const pad = ' '.repeat(options.indent ?? 2);

  /** One mapping per snapshot run: first-seen id keeps the first slot, so order is stable. */
  function redactValue(value: string): string {
    let out = value;
    for (const [name, pattern] of Object.entries(redactRules)) {
      out = out.replace(pattern, (match) => `<redacted:${name}:${match.length}ch>`);
    }
    return out;
  }

  function serialise(node: Node, depth: number, idMap: Map<string, string>): string {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ');
      return text.trim() === '' ? '' : `${' '.repeat(pad.length * depth)}${text.trim()}\n`;
    }
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (ignored.has(tag)) return '';

    if (opaque.has(tag)) {
      return `${' '.repeat(pad.length * depth)}<${tag} …/>\n`;
    }

    const attributeNames = Array.from(el.attributes)
      .map((attribute) => attribute.name)
      .filter((name) => !dropped.has(name))
      .sort();

    const rendered: string[] = [];
    for (const name of attributeNames) {
      const raw = el.getAttribute(name);
      if (raw === null) continue;
      const value = name === 'id' ? canonicalId(raw, idMap) : redactValue(raw);
      rendered.push(`${name}="${value}"`);
    }

    const children = Array.from(el.childNodes);
    const textOnly = children.every((child) => child.nodeType === 3 || child.nodeType === 8);
    if (children.length === 0) return `${' '.repeat(pad.length * depth)}<${tag}${rendered.length > 0 ? ` ${rendered.join(' ')}` : ''} />\n`;

    const open = `${' '.repeat(pad.length * depth)}<${tag}${rendered.length > 0 ? ` ${rendered.join(' ')}` : ''}>`;
    if (textOnly) {
      const text = children.map((child) => (child.textContent ?? '').replace(/\s+/g, ' ').trim()).filter((part) => part !== '');
      return `${open}${text.join(' ')}</${tag}>\n`;
    }
    const body = children.map((child) => serialise(child, depth + 1, idMap)).join('');
    return `${open}\n${body}${' '.repeat(pad.length * depth)}</${tag}>\n`;
  }

  return (root) => {
    const idMap = new Map<string, string>();
    return serialise(root, 0, idMap).replace(/\n{2,}/g, '\n');
  };
}

function canonicalId(value: string, map: Map<string, string>): string {
  if (!REACT_ID.test(value)) return value;
  const existing = map.get(value);
  if (existing !== undefined) return existing;
  const created = `:r${map.size}:`;
  map.set(value, created);
  return created;
}

/** The default serializer, bound to an installed DOM. */
export const serializeDom = (node: Element | DocumentFragment, options: SerializeOptions = {}): string =>
  createSerializer(options)(node);

/**
 * Render-to-string for snapshots without a mount.
 *
 * jsdom is already installed by the time this is called, so `innerHTML` is available; this exists for
 * the pure-markup suites (design-system, tokens) where mounting a root is more machinery than the
 * assertion needs.
 */
export function serializeMarkup(markup: string, options: SerializeOptions = {}): string {
  const { window } = installDom();
  const holder = window.document.createElement('div');
  holder.innerHTML = markup;
  return serializeDom(holder, options);
}
