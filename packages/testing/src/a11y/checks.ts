import { raw } from '@nastech/design-tokens';
import { contrastRatio, hexOf, parseColor, tokenName, type Rgb } from './color.js';
import { ARIA_ATTRIBUTES, KNOWN_ROLES, REQUIRED_STATE, valueIsValid } from './aria-registry.js';

/**
 * The rule set, by hand.
 *
 * No axe/jest-axe here: it is not installed, and even if it were, a general-purpose engine cannot
 * know this product's two rules of record — that a claim must exist as TEXT (`claim_scope`), and that
 * no trust effect may be attached to a check that did not happen (spec §13.2). Those are the checks
 * worth having, and they are the ones a generic engine does not ship.
 *
 * Each rule is a pure function of a root element so it can run on ANY rendered tree: `render()`
 * output, a `container` from an app suite, or an element built with `document.createElement`. Rules
 * report; they do not throw. `a11y/audit.ts` decides severity and whether to fail.
 */

export interface Violation {
  readonly rule: string;
  readonly wcag: string;
  readonly element: Element;
  readonly message: string;
  /** Stable-ish CSS path for the failing node, so a report is actionable without opening DevTools. */
  readonly selector: string;
}

export interface Rule {
  readonly id: string;
  readonly wcag: string;
  readonly help: string;
  check(root: Element): Violation[];
}

export function violation(rule: string, wcag: string, element: Element, message: string): Violation {
  return { rule, wcag, element, message, selector: selectorOf(element) };
}

/** A readable path: `main > section.ds-card:nth-child(3) > button`, tags + classes, no ids. */
export function selectorOf(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current !== null && current.nodeType === 1) {
    const tag = current.tagName.toLowerCase();
    const classes = current.classList.length > 0 ? `.${[...current.classList].join('.')}` : '';
    const parent: Element | null = current.parentElement;
    let suffix = '';
    if (parent !== null) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current!.tagName);
      if (siblings.length > 1) suffix = `:nth-child(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(`${tag}${classes}${suffix}`);
    current = parent;
    if (parts.length > 6) break;
  }
  return parts.join(' > ');
}

function elements(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll('*'))];
}

/** A control is "rendered" for these purposes unless it is `type=hidden` or explicitly inert. */
function isHiddenControl(el: Element): boolean {
  return el instanceof HTMLInputElement && el.type === 'hidden';
}

// ---------------------------------------------------------------------------
// 1. label — a form control must be programmatically associated with its label
// ---------------------------------------------------------------------------

export const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function hasAccessibleLabel(el: Element): boolean {
  if (el.getAttribute('aria-label')?.trim() !== '' && el.getAttribute('aria-label') !== null) return true;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null && labelledBy.trim() !== '') {
    const resolved = labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .some((id) => el.ownerDocument.getElementById(id) !== null);
    if (resolved) return true;
  }
  const id = el.getAttribute('id');
  if (id !== null && id !== '') {
    // `htmlFor` compared directly, not a `label[for="…"]` selector: the harness's jsdom has no `CSS`
    // global, so `CSS.escape` throws here and takes rule 1 down with it for every input that HAS an id
    // — which is the entire point of the rule. Comparing the property needs no escaping at all.
    const forLabel = Array.from(el.ownerDocument.querySelectorAll('label')).find((label) => label.htmlFor === id);
    if (forLabel !== undefined) return true;
  }
  if (el.closest('label') !== null) return true;
  return el.getAttribute('title') !== null && (el.getAttribute('title') ?? '').trim() !== '';
}

export function checkLabels(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    if (!FORM_TAGS.has(el.tagName) || isHiddenControl(el)) continue;
    if ((el as HTMLElement).hasAttribute('hidden')) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (hasAccessibleLabel(el)) continue;
    out.push(
      violation(
        'control-has-label',
        '1.3.1 / 3.3.2',
        el,
        `<${el.tagName.toLowerCase()}> has no label: no <label for>, no wrapping label, no aria-label/aria-labelledby. ` +
          'Placeholder text is not a label — it disappears on input and is read by almost no screen reader.',
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. name — anything you can activate must be able to say what it does
// ---------------------------------------------------------------------------

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'SUMMARY', 'INPUT']);
const WIDGET_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'menuitem',
  'combobox',
  'slider',
  'spinbutton',
  'searchbox',
  'textbox',
  'option',
]);

export function checkNames(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    const role = el.getAttribute('role');
    const isWidget =
      (INTERACTIVE_TAGS.has(el.tagName) && !(el.tagName === 'INPUT' && ['hidden'].includes(inputType(el)))) ||
      (role !== null && WIDGET_ROLES.has(role));
    if (!isWidget) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const name = nameParts(el).trim();
    if (name !== '') continue;
    out.push(
      violation(
        'element-has-name',
        '4.1.2',
        el,
        `A ${role ?? el.tagName.toLowerCase()} is focusable/activatable but announces nothing. ` +
          'A screen-reader user hears "button, " and cannot tell a "Buy" from a "Delete listing".',
      ),
    );
  }
  return out;
}

function inputType(el: Element): string {
  return (el.getAttribute('type') ?? 'text').toLowerCase();
}

/** Deliberately lighter than the full accname spec, and honest about being lighter. */
function nameParts(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label !== null && label.trim() !== '') return label;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy !== null && labelledBy.trim() !== '') {
    return labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
  }
  const alt = el.getAttribute('alt');
  if (alt !== null && alt.trim() !== '') return alt;
  const value = el.getAttribute('value');
  if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(inputType(el)) && value !== null && value.trim() !== '') {
    return value;
  }
  return (el.textContent ?? '');
}

// ---------------------------------------------------------------------------
// 3. contrast — computed from the tokens the component actually rendered with
// ---------------------------------------------------------------------------

/** Inline styles only, and that is the honest limit — see the note on `checkContrast`. */
function styleColor(el: Element, property: 'color' | 'background-color'): Rgb | null {
  const html = el as HTMLElement;
  const direct = html.style?.getPropertyValue(property);
  const parsed = parseColor(direct);
  if (parsed !== null) return parsed;
  return null;
}

function effectiveBackground(el: Element): Rgb {
  let current: Element | null = el;
  while (current !== null) {
    const background = styleColor(current, 'background-color');
    if (background !== null && background.a > 0) return background;
    current = current.parentElement;
  }
  // The page's paper is the documented default surface; assuming it beats reporting nothing, because
  // an element with no background set anywhere is exactly the case contrast must still cover.
  return parseColor(raw.color.paper) ?? { r: 255, g: 255, b: 255, a: 1 };
}

function fontSizePx(el: Element): number {
  const inline = (el as HTMLElement).style?.getPropertyValue('font-size');
  const parsed = Number.parseFloat(inline ?? '');
  return Number.isFinite(parsed) ? parsed : 16;
}

function isBold(el: Element): boolean {
  const weight = (el as HTMLElement).style?.getPropertyValue('font-weight');
  if (weight === null || weight === '') return false;
  const numeric = Number.parseInt(weight, 10);
  if (Number.isFinite(numeric)) return numeric >= 700;
  return weight.toLowerCase() === 'bold' || weight.toLowerCase() === 'bolder';
}

function isLargeText(el: Element): boolean {
  const size = fontSizePx(el);
  return size >= 24 || (size >= 18.66 && isBold(el));
}

/**
 * Text elements whose colour is set inline against a resolvable background.
 *
 * The limit, stated: jsdom does not cascade stylesheets, so a class-driven colour is invisible to
 * this rule. That is acceptable here rather than a fudge because this repo renders colour inline from
 * tokens (`design-system/src/badge.tsx`, `money.tsx`, `ui-3d/src/viewer/canvas-host.tsx` all do), so
 * the paths this rule is meant to guard really are the paths it reads. A suite that moves to CSS files
 * must add a stylesheet-aware variant, and `checks.test.ts` pins the inline assumption so the day that
 * changes, a test fails instead of a check quietly stops firing.
 */
export function checkContrast(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    const foreground = styleColor(el, 'color');
    if (foreground === null) continue;
    if ((el.textContent ?? '').trim() === '') continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const background = effectiveBackground(el);
    const ratio = contrastRatio(foreground, background);
    const required = isLargeText(el) ? 3 : 4.5;
    if (ratio >= required) continue;
    const fgName = tokenName(foreground) ?? hexOf(foreground);
    const bgName = tokenName(background) ?? hexOf(background);
    out.push(
      violation(
        'color-contrast',
        '1.4.3',
        el,
        `${fgName} on ${bgName} is ${ratio.toFixed(2)}:1, below the ${required}:1 needed for ${isLargeText(el) ? 'large' : 'normal'} text. ` +
          `Token pairs are the contract: pick one the palette can carry, not one that needs an exception.`,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. heading order — the document outline is the screen-reader's table of contents
// ---------------------------------------------------------------------------

export function checkHeadingOrder(root: Element): Violation[] {
  const out: Violation[] = [];
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let previous = 0;
  let h1Count = 0;
  for (const heading of headings) {
    const level = Number.parseInt(heading.tagName.slice(1), 10);
    if (level === 1) h1Count += 1;
    if (previous !== 0 && level > previous + 1) {
      out.push(
        violation(
          'heading-order',
          '1.3.1',
          heading,
          `Heading skips from h${previous} to h${level}. Outline navigation jumps that gap silently, ` +
            'so a buyer hears "Condition" and has no idea it belongs under "Listing details".',
        ),
      );
    }
    previous = level;
  }
  if (h1Count > 1) {
    const second = headings.filter((h) => h.tagName === 'H1')[1];
    if (second !== undefined) {
      out.push(
        violation('heading-order', '1.3.1', second, `This tree has ${h1Count} h1 elements; exactly one is the page title.`),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. focus-visible — the ring may be restyled, never removed
// ---------------------------------------------------------------------------

function styleAttributeValue(el: Element): string {
  return el.getAttribute('style')?.toLowerCase().replace(/\s+/g, ' ') ?? '';
}

/**
 * A focusable element that deletes its outline with no replacement. The replacement may be an
 * `outline-color`/`outline-width` pair, a `box-shadow`, or an explicit opt-out on the element
 * (`data-focus-ring="custom"`) for a component that paints its own ring in a stylesheet — the escape
 * hatch exists because the inline-only view genuinely cannot see class CSS, and an honest rule names
 * where it stops.
 */
export function checkFocusVisible(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    if (!isFocusable(el)) continue;
    const style = styleAttributeValue(el);
    const removesOutline = /outline\s*:\s*(none|0)/.test(style) || /outline-width\s*:\s*(none|0)/.test(style);
    if (!removesOutline) continue;
    const replaced = /box-shadow\s*:/.test(style) || /outline-(color|style)\s*:\s*(?!none)/.test(style);
    if (replaced || el.getAttribute('data-focus-ring') === 'custom') continue;
    out.push(
      violation(
        'focus-visible',
        '2.4.7',
        el,
        'A focusable element sets `outline: none` with no visible replacement. A keyboard user has no way to see where they are.',
      ),
    );
  }
  return out;
}

export function isFocusable(el: Element): boolean {
  const tag = el.tagName;
  const tabIndex = el.getAttribute('tabindex');
  if (tabIndex !== null && Number.parseInt(tabIndex, 10) < 0) return false;
  if (tag === 'A') return el.hasAttribute('href');
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SUMMARY') {
    if ((el as HTMLElement).hasAttribute('disabled')) return false;
    return inputType(el) !== 'hidden';
  }
  return tabIndex !== null;
}

// ---------------------------------------------------------------------------
// 6. duplicate ids — `id` is the addressing scheme for labels, so collisions are mis-wiring
// ---------------------------------------------------------------------------

export function checkDuplicateIds(root: Element): Violation[] {
  const out: Violation[] = [];
  const seen = new Map<string, Element>();
  for (const el of elements(root)) {
    const id = el.getAttribute('id');
    if (id === null || id === '') continue;
    const first = seen.get(id);
    if (first === undefined) {
      seen.set(id, el);
      continue;
    }
    out.push(
      violation(
        'duplicate-id',
        '4.1.1',
        el,
        `id="${id}" is used by ${selectorOf(first)} and ${selectorOf(el)}. ` +
          '`<label for>` resolves to the FIRST match, so one of these controls is silently mis-labelled.',
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. aria-* validity — a wrong attribute is worse than none: it changes what is announced
// ---------------------------------------------------------------------------

export function checkAriaValidity(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    const role = el.getAttribute('role');
    if (role !== null && role.trim() !== '' && !KNOWN_ROLES.includes(role.trim())) {
      out.push(
        violation(
          'aria-validity',
          '4.1.2',
          el,
          `role="${role}" is not a role this product renders. An unknown role announces nothing at all: ` +
            'the element loses its original semantics AND gains no new ones.',
        ),
      );
    }

    for (const name of Array.from(el.attributes).map((attribute) => attribute.name)) {
      if (!name.startsWith('aria-')) continue;
      const value = el.getAttribute(name) ?? '';
      const type = ARIA_ATTRIBUTES[name];
      if (type === undefined) {
        out.push(
          violation(
            'aria-validity',
            '4.1.2',
            el,
            `${name} is not a WAI-ARIA attribute (a typo reads as nothing). ` +
              'Assistive tech ignores unknown aria-* in silence, so the intended announcement never happens.',
          ),
        );
        continue;
      }
      if (!valueIsValid(type, value, name)) {
        out.push(
          violation('aria-validity', '4.1.2', el, `${name}="${value}" is not a valid ${type} value.`),
        );
        continue;
      }
      if (type === 'idref' || type === 'idrefs') {
        const missing = value
          .split(/\s+/)
          .filter((token) => token !== '' && el.ownerDocument.getElementById(token) === null);
        if (missing.length > 0) {
          out.push(
            violation(
              'aria-validity',
              '1.3.1',
              el,
              `${name} references missing id(s): ${missing.join(', ')}. A dangling reference is read as an empty string.`,
            ),
          );
        }
      }
    }

    // Roles with required states, because "role=checkbox with no aria-checked" is a control whose
    // state is invisible: the reader says "checkbox" and never says whether it is ticked.
    if (role !== null && REQUIRED_STATE[role] !== undefined) {
      const required = REQUIRED_STATE[role]!;
      if (!el.hasAttribute(required) && !(el instanceof HTMLInputElement && (inputType(el) === 'checkbox' || inputType(el) === 'radio'))) {
        out.push(
          violation('aria-validity', '4.1.2', el, `role="${role}" requires ${required}; the state is currently unannounced.`),
        );
      }
    }
    if (role === 'heading') {
      const level = Number.parseInt(el.getAttribute('aria-level') ?? '', 10);
      if (!Number.isFinite(level) || level < 1 || level > 6) {
        out.push(violation('aria-validity', '1.3.1', el, 'role="heading" requires aria-level 1–6.'));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 8. image-alt — a poster IS the listing; an unlabelled one is a blank gap in the page
// ---------------------------------------------------------------------------

export function checkImageAlt(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    if (el.tagName !== 'IMG') continue;
    const alt = el.getAttribute('alt');
    if (alt === null) {
      out.push(
        violation(
          'image-alt',
          '1.1.1',
          el,
          '<img> has no alt attribute at all. A decorative image needs alt="" and a content image needs text; ' +
            'silence is what a reader gets when the attribute is missing.',
        ),
      );
      continue;
    }
    if (alt.trim() === '' && el.getAttribute('role') !== 'presentation' && el.getAttribute('aria-hidden') !== 'true') {
      const hasLabel = (el.getAttribute('aria-label') ?? '').trim() !== '' || (el.getAttribute('aria-labelledby') ?? '').trim() !== '';
      if (!hasLabel && el.closest('label') === null) {
        out.push(
          violation(
            'image-alt',
            '1.1.1',
            el,
            'alt="" hides a content image. This is a listing poster — the buyer is entitled to know what the item looks like.',
          ),
        );
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 9. aria-hidden on a focusable subtree — the classic "trap": reachable but unspeakable
// ---------------------------------------------------------------------------

export function checkAriaHiddenFocusable(root: Element): Violation[] {
  const out: Violation[] = [];
  const hidden = Array.from(root.querySelectorAll('[aria-hidden="true"]'));
  if (root.getAttribute('aria-hidden') === 'true') hidden.unshift(root);
  for (const container of hidden) {
    const focusables = Array.from(container.querySelectorAll('*')).filter(isFocusable);
    for (const el of focusables) {
      out.push(
        violation(
          'aria-hidden-focusable',
          '4.1.2',
          el,
          'A focusable element sits inside aria-hidden="true": Tab reaches it, a screen reader never announces it. ' +
            'Hide it from keyboard too (`tabindex="-1"` + `inert`), or un-hide it.',
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 10. the product's own rule: a claim that only exists in a render
// ---------------------------------------------------------------------------

/**
 * Spec §13.2 and `claim_scope` together: condition evidence must exist as TEXT, and no element may
 * assert a verification the ledger did not perform. Both are DOM-visible, so both are checkable here
 * rather than in a design review.
 */
export const BANNED_TRUST_WORDS: readonly string[] = ['verified', 'guaranteed', 'authenticated', 'certified', 'inspected by nastech'];

export function checkTrustClaims(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    const text = (el.textContent ?? '').toLowerCase();
    const hit = BANNED_TRUST_WORDS.find((word) => text.includes(word));
    if (hit === undefined) continue;
    // Only leaf text nodes are reported, so one banner produces one finding, not one per ancestor.
    const hasTextChild = Array.from(el.children).some((child) => (child.textContent ?? '').toLowerCase().includes(hit));
    if (hasTextChild) continue;
    const animated = el.getAttribute('data-motion') !== null || /animation|transition/.test(styleAttributeValue(el));
    out.push(
      violation(
        'no-unbacked-trust-claim',
        '§13.2',
        el,
        `Copy contains "${hit}". A trust word is a claim: it must come from a tier in TIER_LABELS or a check the ` +
          'ledger actually ran.' +
          (animated ? ' It is also attached to motion, which §13.2 blocks outright.' : ''),
      ),
    );
  }
  return out;
}

/** `data-claim-scope` on a surface must be accompanied by the scope's text, not a badge alone. */
export function checkClaimScopeText(root: Element): Violation[] {
  const out: Violation[] = [];
  for (const el of elements(root)) {
    const scope = el.getAttribute('data-claim-scope');
    if (scope === null) continue;
    const text = (el.textContent ?? '').trim();
    if (text.length < 40) {
      out.push(
        violation(
          'claim-scope-is-text',
          '07 §6.2',
          el,
          `data-claim-scope="${scope}" with only "${text}" as text. The dispute process reads TEXT; a badge is not evidence.`,
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

export const RULES: readonly Rule[] = [
  { id: 'control-has-label', wcag: '1.3.1 / 3.3.2', help: 'Every form control has a programmatic label.', check: checkLabels },
  { id: 'element-has-name', wcag: '4.1.2', help: 'Every widget has an accessible name.', check: checkNames },
  { id: 'color-contrast', wcag: '1.4.3', help: 'Text meets 4.5:1 (3:1 large) against its background.', check: checkContrast },
  { id: 'heading-order', wcag: '1.3.1', help: 'Heading levels nest; exactly one h1.', check: checkHeadingOrder },
  { id: 'focus-visible', wcag: '2.4.7', help: 'Focus is never removed without a visible replacement.', check: checkFocusVisible },
  { id: 'duplicate-id', wcag: '4.1.1', help: 'ids are unique within the tree.', check: checkDuplicateIds },
  { id: 'aria-validity', wcag: '4.1.2', help: 'aria-* names, values, references and required states are valid.', check: checkAriaValidity },
  { id: 'image-alt', wcag: '1.1.1', help: 'Images declare decorative or alternative text.', check: checkImageAlt },
  { id: 'aria-hidden-focusable', wcag: '4.1.2', help: 'Nothing focusable hides inside aria-hidden.', check: checkAriaHiddenFocusable },
  { id: 'no-unbacked-trust-claim', wcag: '§13.2', help: 'No invented verification language or motion on trust states.', check: checkTrustClaims },
  { id: 'claim-scope-is-text', wcag: '07 §6.2', help: 'A render claim exists in text, because the dispute process reads text.', check: checkClaimScopeText },
];

export const RULE_IDS: readonly string[] = RULES.map((rule) => rule.id);
