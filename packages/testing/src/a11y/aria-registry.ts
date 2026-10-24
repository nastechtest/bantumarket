/**
 * What this product is allowed to say in ARIA, as data.
 *
 * The registry lives apart from the check that uses it: a check walks the DOM, this file only answers
 * "is `aria-live=polite` a thing". Keeping the subset explicit is the point — an attribute outside it
 * is reported rather than guessed at, so a typo (`aria-lable`) fails loudly instead of announcing
 * nothing in silence. `KNOWN_ROLES` is the same argument for `role=`: an unknown role strips the
 * element's native semantics and grants none, which is worse than rendering nothing at all.
 */
export type AriaValueType = 'boolean' | 'tristate' | 'idref' | 'idrefs' | 'token' | 'tokens' | 'number' | 'string';

/** The subset of WAI-ARIA 1.2 this product's components actually use, plus their value types. */
export const ARIA_ATTRIBUTES: Readonly<Record<string, AriaValueType>> = {
  'aria-label': 'string',
  'aria-labelledby': 'idrefs',
  'aria-describedby': 'idrefs',
  'aria-controls': 'idrefs',
  'aria-owns': 'idrefs',
  'aria-current': 'token',
  'aria-checked': 'tristate',
  'aria-selected': 'boolean',
  'aria-expanded': 'boolean',
  'aria-pressed': 'tristate',
  'aria-disabled': 'boolean',
  'aria-hidden': 'boolean',
  'aria-live': 'token',
  'aria-busy': 'boolean',
  'aria-atomic': 'boolean',
  'aria-relevant': 'tokens',
  'aria-level': 'number',
  'aria-valuemin': 'number',
  'aria-valuemax': 'number',
  'aria-valuenow': 'number',
  'aria-valuetext': 'string',
  'aria-orientation': 'token',
  'aria-haspopup': 'token',
  'aria-invalid': 'token',
  'aria-required': 'boolean',
  'aria-roledescription': 'string',
  'aria-keyshortcuts': 'string',
  'aria-placeholder': 'string',
  'aria-errormessage': 'idref',
};

const TOKEN_VALUES: Readonly<Record<string, readonly string[]>> = {
  'aria-current': ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
  'aria-live': ['off', 'polite', 'assertive'],
  'aria-relevant': ['additions', 'removals', 'text', 'all'],
  'aria-orientation': ['horizontal', 'vertical', 'undefined'],
  'aria-haspopup': ['false', 'true', 'menu', 'listbox', 'tree', 'grid', 'dialog'],
  'aria-invalid': ['false', 'true', 'grammar', 'spelling'],
};

/** Roles this codebase is allowed to render. Unlisted roles are reported, not guessed at. */
export const KNOWN_ROLES: readonly string[] = [
  'alert',
  'alertdialog',
  'article',
  'banner',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'dialog',
  'definition',
  'document',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
];

const BOOLEAN_VALUES = new Set(['true', 'false']);
const TRISTATE_VALUES = new Set(['true', 'false', 'mixed']);

export const REQUIRED_STATE: Readonly<Partial<Record<string, string>>> = {
  checkbox: 'aria-checked',
  switch: 'aria-checked',
  radio: 'aria-checked',
  combobox: 'aria-expanded',
};

export function valueIsValid(type: AriaValueType, raw: string, name: string): boolean {
  const value = raw.trim();
  if (type === 'boolean') return BOOLEAN_VALUES.has(value.toLowerCase());
  if (type === 'tristate') return TRISTATE_VALUES.has(value.toLowerCase());
  if (type === 'number') return value !== '' && Number.isFinite(Number.parseFloat(value));
  if (type === 'idref') return value !== '';
  if (type === 'idrefs') return value !== '';
  if (type === 'string') return true;
  if (type === 'token') {
    const allowed = TOKEN_VALUES[name];
    if (allowed === undefined) return value !== '';
    return allowed.includes(value.toLowerCase());
  }
  if (type === 'tokens') {
    const allowed = TOKEN_VALUES[name] ?? [];
    const parts = value.split(/\s+/).filter((part) => part !== '');
    return parts.length > 0 && parts.every((part) => allowed.includes(part.toLowerCase()));
  }
  return true;
}
