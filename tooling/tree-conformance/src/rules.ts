/**
 * Rule data for the tree-conformance gate.
 *
 * The rules are data so the checker, the README and the self-test cannot drift: every rule has an
 * id, a stable name, the reason it exists, and the human action when it fires. The self-test proves
 * each rule can fire; this file is the only place a limit or an exception is allowed to live.
 */

export interface RuleSpec {
  readonly id: number;
  readonly name: string;
  /** One sentence a reviewer can act on. */
  readonly summary: string;
  /** Why the rule exists, in product terms rather than tool terms. */
  readonly why: string;
  /** What a human should do when the rule fires. */
  readonly action: string;
}

export const RULES: readonly RuleSpec[] = [
  {
    id: 1,
    name: 'route-completeness',
    summary: 'Every Routes entry has exactly one page module whose default export takes { route }.',
    why:
      'The router is the only inventory of screens. A route with no page is a blank navigation ' +
      'target; a page with no route is dead code that reviewers still pay for. RouteDef is the ' +
      'page contract, so a page that ignores it cannot read its path parameter and will silently ' +
      'render the wrong order or listing.',
    action:
      'Add the missing page module, delete the orphan, or change the page default export to ' +
      '`export default function Page({ route }: { route: RouteDef })`.',
  },
  {
    id: 2,
    name: 'feature-isolation',
    summary: 'No feature imports another feature.',
    why:
      'Features are parallel workstreams. A cross-feature import makes two briefs share a private ' +
      'API, turns a local rename into a cross-team break, and quietly grows the first-paint graph. ' +
      'Shared code belongs in a package or in the app lib, where it has one owner and one contract.',
    action:
      'Move the shared helper to `src/lib/` or a package and import it from both features. If the ' +
      'helper is test-only, put it in a shared test-support module outside both feature trees.',
  },
  {
    id: 3,
    name: 'app-isolation',
    summary: 'No app imports another app.',
    why:
      'The buyer, seller and staff apps are separate deployments with separate sessions, budgets ' +
      'and threat models. An app-to-app import couples their release trains and can leak staff or ' +
      'seller code into the public bundle. Cross-app behaviour belongs behind an HTTP contract.',
    action:
      'Move the shared code to a package, or call the other app through its transport/API. Never ' +
      'import its source.',
  },
  {
    id: 4,
    name: 'package-direction',
    summary: 'Packages never import apps or features, and the only package surface is its exports map.',
    why:
      'A package is a contract, not a folder. Relative walks into `packages/x/src` bypass the ' +
      'exports map, so a package can be changed by someone who never read its public API, and the ' +
      'bundler can pull a private module into a route that was never budgeted for it. Packages ' +
      'importing apps points the dependency arrow backwards and makes the package unreusable.',
    action:
      'Import the package by its declared subpath (`@nastech/x` or a key in its `exports`). If a ' +
      'needed export is missing, ask the package owner to add it to `exports`; do not reach into ' +
      'the folder.',
  },
  {
    id: 5,
    name: 'no-authored-js',
    summary: 'No .js or .jsx under any src/.',
    why:
      'JavaScript in src is either build output committed by mistake or a file that escaped the ' +
      'typechecker. Both make the source of truth ambiguous: reviewers cannot tell what is edited ' +
      'and what is regenerated, and a stale output file can be imported instead of its TypeScript ' +
      'source.',
    action:
      'Delete the file and author it as .ts/.tsx; if it is genuinely generated, move it out of ' +
      'src/ and add it to the build output directory.',
  },
  {
    id: 6,
    name: 'one-main-per-route',
    summary: 'A page module must not declare a <main> landmark; the shell owns the document main.',
    why:
      'Two main landmarks make skip links, screen-reader landmarks and print layouts ambiguous, ' +
      'and `aria-labelledby` on the shell main then describes only half the page. The shell owns ' +
      'the first (and only) main; a page that adds its own is the second.',
    action:
      'Remove the page-level <main> and render a <section> (or a fragment) inside the shell. If ' +
      'the page is rendered outside the shell, fix the shell wiring instead of adding a landmark.',
  },
  {
    id: 7,
    name: 'size-budget',
    summary: 'No src/** TypeScript file over 600 lines without a named exception in rules.ts.',
    why:
      'A 1,400-line component is where review stops happening: diffs become unreviewable, ' +
      'ownership blurs, and the file accumulates every concern because splitting it is always ' +
      'someone else\'s next task. The limit is a review prompt, not an aesthetic preference.',
    action:
      'Split the file by responsibility (state, transport, presentation), or record a named ' +
      'exception in `src/rules.ts` with an owner and a reason. An exception is a decision, not a ' +
      'silent threshold change.',
  },
  {
    id: 8,
    name: 'critical-route-guard',
    summary: 'Every critical route has a test proving refusal or redirect without a session.',
    why:
      'A critical route touches credentials, money or a dispute. A guard that is only implemented ' +
      'is a guard that can be deleted in a refactor without any test going red. The test is the ' +
      'proof that an anonymous visitor is refused, not merely that a signed-in visitor succeeds.',
    action:
      'Add a test in the route\'s feature that starts with no session and asserts the refusal or ' +
      'redirect (for example, the guard renders the sign-in prompt and not the protected content).',
  },
];

export const RULE_BY_ID: ReadonlyMap<number, RuleSpec> = new Map(RULES.map((r) => [r.id, r]));

/** Lines are counted the way `wc -l` counts them: newline-delimited. */
export const SIZE_LIMIT_LINES = 600;

/**
 * Named size exceptions, keyed by path relative to the repo root, value the reason and owner.
 *
 * Empty on purpose. The current tree's three files over the limit are reported as findings; blessing
 * them here without the controller's decision would be weakening the rule to make the tree pass.
 * The shape exists so a future exception is a reviewable line in this file, not a changed number.
 */
export const SIZE_EXCEPTIONS: Readonly<Record<string, string>> = {};

/** The route class whose pages must carry a no-session proof. */
export const CRITICAL_ROUTE_CLASS = 'critical';

/**
 * A test asserts no-session behaviour if its body names the absence of a session...
 * Keep these literal and few; a broad marker makes rule 8 pass on a test that never sets up the
 * anonymous state.
 */
export const NO_SESSION_MARKERS: readonly RegExp[] = [
  /\banonymous\b/i,
  /\bunauthenticated\b/i,
  /\bsigned[ -]?out\b/i,
  /\bwithout (?:a )?session\b/i,
  /\bno session\b/i,
  /\bnot signed in\b/i,
  /\bendSession\b/,
  /\bclearSession\b/,
  /\bsession\s*[:=]\s*null\b/,
  /\bgetSession\s*\(\s*\)\s*=>\s*null\b/,
];

/**
 * ...and the refusal or redirect that follows. `sign-in` is included because the refusal often
 * lands on the sign-in screen, but it only counts together with a no-session marker and an
 * assertion.
 */
export const REFUSAL_MARKERS: readonly RegExp[] = [
  /\bredirect(?:s|ed|ing)?\b/i,
  /\brefus(?:e|es|ed|al)\b/i,
  /\bguard(?:ed|s)?\b/i,
  /\bforbidden\b/i,
  /\bdenied\b/i,
  /\bnot (?:render(?:ed|s)?|shown|displayed)\b/i,
  /\bdoes not render\b/i,
  /\bnever renders?\b/i,
  /\bsign-?in\b/i,
  /\bRequireSession\b/,
  /\b401\b/,
  /\b403\b/,
];

/** Directories never walked. Build output and dependencies are not source of truth. */
export const EXCLUDED_DIR_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'dist-no3d',
  'coverage',
  '.git',
  '.turbo',
  '.vite',
]);
