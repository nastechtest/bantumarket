/**
 * Every rule in the a11y engine, in both directions.
 *
 * A rule that never fires is indistinguishable from a page that has no violations, and this engine is
 * the only thing standing between the design system and an accessibility claim. So each rule here gets
 * the markup it must catch AND the correct markup it must leave alone — the second half is what stops a
 * rule from being satisfied by a bug in its own selector.
 *
 * Fixtures are mounted into the live document rather than left detached, because three rules resolve
 * ids (`label[for]`, `aria-labelledby`, duplicate references) and a detached tree makes every one of
 * them report a dangling reference that does not exist on a real page.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import { raw } from '@nastech/design-tokens';
import { installDom } from '../../dom/env.js';
import {
  BANNED_TRUST_WORDS,
  RULES,
  RULE_IDS,
  checkAriaHiddenFocusable,
  checkAriaValidity,
  checkClaimScopeText,
  checkContrast,
  checkDuplicateIds,
  checkFocusVisible,
  checkHeadingOrder,
  checkImageAlt,
  checkLabels,
  checkNames,
  checkTrustClaims,
  hasAccessibleLabel,
  isFocusable,
} from '../checks.js';
import type { Violation } from '../checks.js';

const dom = installDom();
const mounted: HTMLElement[] = [];

function mount(html: string): HTMLElement {
  const host = dom.document.createElement('div');
  host.innerHTML = html;
  dom.document.body.appendChild(host);
  mounted.push(host);
  return host;
}

const fired = (out: readonly Violation[]): string[] => out.map((v) => v.rule);
const only = (out: readonly Violation[]): Violation => {
  if (out.length !== 1) throw new Error(`expected exactly one finding, got ${out.length}: ${fired(out).join(' | ')}`);
  return out[0]!;
};

afterEach(() => {
  for (const el of mounted) el.remove();
  mounted.length = 0;
});

describe('1. control-has-label', () => {
  it('catches the placeholder-only input, which is the mistake the app actually makes', () => {
    const out = checkLabels(mount('<input placeholder="Your name" />'));
    expect(only(out).message).toContain('Placeholder text is not a label');
  });

  it('accepts each of the four real associations', () => {
    expect(checkLabels(mount('<label for="n">Name</label><input id="n" />'))).toEqual([]);
    expect(checkLabels(mount('<label>Phone <input /></label>'))).toEqual([]);
    expect(checkLabels(mount('<input aria-label="Quantity" />'))).toEqual([]);
    expect(checkLabels(mount('<span id="t">Town</span><input aria-labelledby="t" />'))).toEqual([]);
  });

  it('resolves both association styles against the document, not against the fixture', () => {
    // `aria-labelledby` requires the referenced id to exist; `<label for>` only counts when the pair is
    // really wired. Each half is asserted so a future rewrite cannot loosen one while the other stays green.
    expect(hasAccessibleLabel(mount('<input aria-labelledby="nowhere" />').firstElementChild!)).toBe(false);
    expect(checkLabels(mount('<input aria-labelledby="nowhere" />'))).toHaveLength(1);
    expect(checkLabels(mount('<label for="ghost">Town</label><input id="town" />'))).toHaveLength(1);
    expect(checkLabels(mount('<label for="town">Town</label><input id="town" />'))).toEqual([]);
  });

  it('does not demand a label from a control nobody can see', () => {
    expect(checkLabels(mount('<input type="hidden" name="_token" value="x" />'))).toEqual([]);
    expect(checkLabels(mount('<input hidden />'))).toEqual([]);
    expect(checkLabels(mount('<input aria-hidden="true" />'))).toEqual([]);
  });

  it('covers textarea and select, not just input', () => {
    expect(fired(checkLabels(mount('<textarea></textarea><select><option>a</option></select>')))).toEqual([
      'control-has-label',
      'control-has-label',
    ]);
  });
});

describe('2. element-has-name', () => {
  it('catches an icon-only button, which is the shape a listing toolbar is built from', () => {
    const out = checkNames(mount('<button><svg></svg></button>'));
    expect(only(out).message).toContain('cannot tell a "Buy" from a "Delete listing"');
  });

  it('accepts a visible label, an aria-label, or a labelled-by reference with text behind it', () => {
    expect(checkNames(mount('<button>Buy now</button>'))).toEqual([]);
    expect(checkNames(mount('<button aria-label="Close"></button>'))).toEqual([]);
    expect(checkNames(mount('<span id="v">Close</span><button aria-labelledby="v"></button>'))).toEqual([]);
  });

  it('treats an explicit role as a widget even on a div, and a submit value as a name', () => {
    expect(checkNames(mount('<div role="button"></div>'))).toHaveLength(1);
    expect(checkNames(mount('<div role="button">Save</div>'))).toEqual([]);
    expect(checkNames(mount('<input type="submit" value="Place order" />'))).toEqual([]);
  });

  it('uses alt text as the name for an image button', () => {
    expect(checkNames(mount('<input type="image" alt="Search the market" />'))).toEqual([]);
    expect(checkNames(mount('<input type="image" />'))).toHaveLength(1);
  });

  it('leaves a hidden input alone', () => {
    expect(checkNames(mount('<input type="hidden" />'))).toEqual([]);
  });
});

describe('3. color-contrast', () => {
  it('fails a grey one hex digit below the threshold and passes the one above it', () => {
    const failing = checkContrast(mount(`<div style="background-color:${raw.color.paper}"><p style="color:#777777">Price</p></div>`));
    expect(only(failing).message).toContain('#777777 on raw.color.paper is 4.48:1, below the 4.5:1 needed for normal text');
    expect(checkContrast(mount(`<div style="background-color:${raw.color.paper}"><p style="color:#767676">Price</p></div>`))).toEqual([]);
  });

  it('applies the 3:1 large-text threshold to size and to weight, not to wishful thinking', () => {
    const grey = '#949494';
    expect(checkContrast(mount(`<p style="color:${grey};font-size:24px">Condition</p>`))).toEqual([]);
    expect(checkContrast(mount(`<p style="color:${grey};font-size:19px;font-weight:700">Condition</p>`))).toEqual([]);
    expect(checkContrast(mount(`<p style="color:${grey};font-size:19px;font-weight:400">Condition</p>`))).toHaveLength(1);
    expect(checkContrast(mount(`<p style="color:${grey};font-size:16px;font-weight:900">Condition</p>`))).toHaveLength(1);
  });

  it('walks up the tree for the background instead of assuming white', () => {
    // #777777 on black is 4.69:1 and legal; the same grey on the assumed paper is 4.48:1 and would be
    // reported. So this fixture catches a false positive, which is the direction an "assume white"
    // shortcut actually breaks in.
    expect(checkContrast(mount('<div style="background-color:#000000"><div style="background-color:rgba(0,0,0,0)"><p style="color:#777777">x</p></div></div>'))).toEqual([]);
    const caught = checkContrast(mount('<div style="background-color:#767676"><p style="color:#7B858F">x</p></div>'));
    expect(only(caught).message).toContain('raw.color.ink300 on #767676');
  });

  it('ignores empty and explicitly hidden text', () => {
    expect(checkContrast(mount('<p style="color:#777777">   </p>'))).toEqual([]);
    expect(checkContrast(mount('<p style="color:#777777" aria-hidden="true">decorative</p>'))).toEqual([]);
  });

  it('pins the inline-style limit: a class-driven colour is invisible to this rule', () => {
    const style = dom.document.createElement('style');
    style.textContent = '.muted { color: #777777; }';
    dom.document.head.appendChild(style);
    const out = checkContrast(mount('<div style="background-color:#FFFFFF"><p class="muted">Condition notes</p></div>'));
    style.remove();
    // This assertion is deliberately a PASS-the-wrong-way check. The day it fails, the rule has become
    // stylesheet-aware and the honest-limit note above `checkContrast` must be rewritten, not deleted.
    expect(out).toEqual([]);
  });

  it('defaults to the documented paper token when nothing sets a background', () => {
    expect(only(checkContrast(mount(`<p style="color:${raw.color.ink300}">Disabled</p>`))).message).toContain('on raw.color.paper');
  });
});

describe('4. heading-order', () => {
  it('catches a skipped level and a second h1, and never catches a legal nest', () => {
    expect(only(checkHeadingOrder(mount('<h1>Listing</h1><h3>Condition</h3>'))).message).toContain('Heading skips from h1 to h3');
    expect(checkHeadingOrder(mount('<h1>Listing</h1><h2>Details</h2><h3>Condition</h3>'))).toEqual([]);
    const twoH1 = checkHeadingOrder(mount('<h1>Buy</h1><h2>Item</h2><h1>Seller</h1>'));
    expect(twoH1).toHaveLength(1);
    expect(only(twoH1).message).toContain('2 h1 elements');
  });

  it('does not fire when the tree has no headings at all', () => {
    expect(checkHeadingOrder(mount('<p>Just text</p>'))).toEqual([]);
  });
});

describe('5. focus-visible', () => {
  it('catches a bare outline removal on anything keyboard-reachable', () => {
    expect(only(checkFocusVisible(mount('<button style="outline: none">Pay</button>'))).rule).toBe('focus-visible');
    expect(checkFocusVisible(mount('<button style="outline:0">Pay</button>'))).toHaveLength(1);
  });

  it('accepts a stated replacement: a ring drawn by box-shadow, an outline restyle, or the custom escape hatch', () => {
    expect(checkFocusVisible(mount('<button style="outline: none; box-shadow: 0 0 0 3px #0F62FE">Pay</button>'))).toEqual([]);
    expect(checkFocusVisible(mount('<button style="outline: none; outline-color: #0F62FE">Pay</button>'))).toEqual([]);
    expect(checkFocusVisible(mount('<button style="outline: none" data-focus-ring="custom">Pay</button>'))).toEqual([]);
  });

  it('only cares about elements a keyboard can actually reach', () => {
    expect(checkFocusVisible(mount('<div style="outline: none">not focusable</div>'))).toEqual([]);
    // An `<a>` with no href is not focusable, and `isFocusable` says so — the rule must not invent a
    // violation for a link that cannot receive focus.
    expect(checkFocusVisible(mount('<a style="outline: none">no href</a>'))).toEqual([]);
    expect(isFocusable(mount('<a href="/x">link</a>').firstElementChild!)).toBe(true);
    expect(isFocusable(mount('<button disabled>gone</button>').firstElementChild!)).toBe(false);
    expect(isFocusable(mount('<div tabindex="-1">programmatic only</div>').firstElementChild!)).toBe(false);
    expect(isFocusable(mount('<div tabindex="0">widget</div>').firstElementChild!)).toBe(true);
  });
});

describe('6. duplicate-id', () => {
  it('names both selectors, because the label resolves to the first and the second is the broken one', () => {
    const out = only(checkDuplicateIds(mount('<div id="q"><span id="q"></span></div>')));
    expect(out.message).toContain('id="q" is used by');
    expect(out.message).toContain('FIRST match');
  });

  it('stays silent on unique ids and ignores empty ones', () => {
    expect(checkDuplicateIds(mount('<input id="a" /><input id="b" />'))).toEqual([]);
    expect(checkDuplicateIds(mount('<input id="" /><input id="" />'))).toEqual([]);
  });
});

describe('7. aria-validity', () => {
  it('refuses a role this product does not render, and explains what it costs', () => {
    const out = only(checkAriaValidity(mount('<div role="cArDer">x</div>')));
    expect(out.message).toContain('loses its original semantics AND gains no new ones');
  });

  it('refuses a typo in an aria attribute rather than reading it as nothing', () => {
    expect(only(checkAriaValidity(mount('<button aria-lable="Close">x</button>'))).message).toContain('aria-lable is not a WAI-ARIA attribute');
  });

  it('refuses a value the attribute type cannot hold', () => {
    expect(checkAriaValidity(mount('<div aria-live="loud">x</div>'))).toHaveLength(1);
    expect(checkAriaValidity(mount('<div aria-current="page">x</div>'))).toEqual([]);
    expect(checkAriaValidity(mount('<div aria-orientation="horizontal">x</div>'))).toEqual([]);
    expect(checkAriaValidity(mount('<div aria-level="seven">x</div>'))).toHaveLength(1);
  });

  it('catches a dangling id reference, which is read as an empty string', () => {
    const out = only(checkAriaValidity(mount('<input aria-describedby="gone" />')));
    expect(out.message).toContain('references missing id(s): gone');
    expect(checkAriaValidity(mount('<span id="hint">h</span><input aria-describedby="hint" />'))).toEqual([]);
  });

  it('requires the state a role promises, and accepts the native control that already carries it', () => {
    expect(only(checkAriaValidity(mount('<div role="checkbox"></div>'))).message).toContain('requires aria-checked');
    expect(checkAriaValidity(mount('<div role="checkbox" aria-checked="false"></div>'))).toEqual([]);
    expect(checkAriaValidity(mount('<input type="checkbox" />'))).toEqual([]);
    expect(checkAriaValidity(mount('<div role="heading" aria-level="3"></div>'))).toEqual([]);
    expect(checkAriaValidity(mount('<div role="heading"></div>'))).toHaveLength(1);
  });
});

describe('8. image-alt', () => {
  it('distinguishes "no alt" from "alt empty" and treats both as findings on a poster', () => {
    expect(only(checkImageAlt(mount('<img src="/p.jpg" />'))).message).toContain('has no alt attribute at all');
    expect(only(checkImageAlt(mount('<img src="/p.jpg" alt="" />'))).message).toContain('hides a content image');
  });

  it('accepts a decoration marked as decoration, and content marked as content', () => {
    expect(checkImageAlt(mount('<img src="/p.jpg" alt="Used road bike, 56cm frame" />'))).toEqual([]);
    expect(checkImageAlt(mount('<img src="/rule.png" alt="" role="presentation" />'))).toEqual([]);
    expect(checkImageAlt(mount('<img src="/rule.png" alt="" aria-hidden="true" />'))).toEqual([]);
    // An empty-alt image inside a control that names itself is the control's decoration, not content.
    expect(fired(checkImageAlt(mount('<label>Photo <input type="file" /><img src="/t.jpg" alt="" /></label>')))).toEqual([]);
    // …but the same image as a sibling of that label is a poster with no alternative text, and the
    // difference between the two fixtures is the whole point of the rule.
    expect(fired(checkImageAlt(mount('<label>Photo <input type="file" /></label><img src="/t.jpg" alt="" />')))).toEqual([
      'image-alt',
    ]);
  });

  it('gives one finding per image, not one per wrapper', () => {
    expect(checkImageAlt(mount('<figure><img src="/p.jpg" /></figure>'))).toHaveLength(1);
  });
});

describe('9. aria-hidden-focusable', () => {
  it('catches the trap: keyboard reaches it, a reader never says it exists', () => {
    expect(only(checkAriaHiddenFocusable(mount('<div aria-hidden="true"><button>Hide me</button></div>'))).message).toContain('Tab reaches it');
  });

  it('honours the fix — removing it from the tab order too', () => {
    expect(checkAriaHiddenFocusable(mount('<div aria-hidden="true"><button tabindex="-1">gone</button></div>'))).toEqual([]);
    expect(checkAriaHiddenFocusable(mount('<div aria-hidden="true"><p>plain text is fine</p></div>'))).toEqual([]);
  });

  it('applies when the audited root itself is the hidden subtree', () => {
    const host = mount('<button>Pay</button>');
    host.setAttribute('aria-hidden', 'true');
    expect(checkAriaHiddenFocusable(host)).toHaveLength(1);
  });
});

describe('10. the product rules: no unbacked trust claim, and a render claim in text', () => {
  it('catches a banned trust word once, at the leaf that holds it', () => {
    const tree = mount('<section><p>This seller is Verified and the item is guaranteed to work</p></section>');
    const out = checkTrustClaims(tree);
    expect(out).toHaveLength(1);
    expect(only(out).message).toContain('Copy contains "verified"');
    expect(BANNED_TRUST_WORDS).toContain('inspected by nastech');
    expect(checkTrustClaims(mount('<p>The seller says the frame is 56cm</p>'))).toEqual([]);
  });

  it('adds the §13.2 sentence when the claim is also wearing motion', () => {
    const out = only(checkTrustClaims(mount('<span data-motion="pulse">Authenticated seller</span>')));
    expect(out.message).toContain('attached to motion, which §13.2 blocks outright');
  });

  it('requires the scope to be readable text, not a badge', () => {
    expect(only(checkClaimScopeText(mount('<div data-claim-scope="cosmetic">Cosmetic</div>'))).message).toContain('a badge is not evidence');
    const ok = checkClaimScopeText(
      mount('<div data-claim-scope="cosmetic">NasTech records what the seller photographed; it does not inspect the item, so wear is described by the seller, not by us.</div>'),
    );
    expect(ok).toEqual([]);
  });
});

describe('the rule set itself', () => {
  it('registers exactly the eleven rules, each with the copy the reporter prints', () => {
    expect(RULE_IDS).toEqual([
      'control-has-label',
      'element-has-name',
      'color-contrast',
      'heading-order',
      'focus-visible',
      'duplicate-id',
      'aria-validity',
      'image-alt',
      'aria-hidden-focusable',
      'no-unbacked-trust-claim',
      'claim-scope-is-text',
    ]);
    for (const rule of RULES) {
      expect(rule.id.trim().length).toBeGreaterThan(0);
      expect(rule.wcag.trim().length).toBeGreaterThan(0);
      expect(rule.help.trim().length).toBeGreaterThan(20);
    }
  });

  it('has no rule that cannot see the violation it is named for', () => {
    // One fixture per rule id: if a rule stops firing because a selector was renamed, this is the test
    // that says so, and it says which rule went quiet.
    const traps: Record<string, string> = {
      'control-has-label': '<input />',
      'element-has-name': '<button></button>',
      'color-contrast': `<p style="color:#777777;background-color:#FFFFFF">x</p>`,
      'heading-order': '<h1>a</h1><h3>b</h3>',
      'focus-visible': '<button style="outline: none">x</button>',
      'duplicate-id': '<i id="d"></i><i id="d"></i>',
      'aria-validity': '<div role="cArDer">x</div>',
      'image-alt': '<img src="/a.jpg" />',
      'aria-hidden-focusable': '<div aria-hidden="true"><button>x</button></div>',
      'no-unbacked-trust-claim': '<span>Verified seller</span>',
      'claim-scope-is-text': '<div data-claim-scope="cosmetic">short</div>',
    };
    for (const rule of RULES) {
      expect(rule.check(mount(traps[rule.id]!)).some((v) => v.rule === rule.id)).toBe(true);
    }
  });
});
