# Tree conformance

A structural gate over the NasTech Market monorepo. It audits boundaries that TypeScript cannot
express: which route owns which page, which feature may import which, which direction packages may
depend, and whether a critical route has a test proving it refuses an anonymous visitor.

The gate never rewrites the tree. It reports `file:line` and exits non-zero.

```
bun tooling/tree-conformance/check.ts            # audit the monorepo
bun tooling/tree-conformance/check.ts --verbose  # plus inventory and per-rule counts
bun tooling/tree-conformance/check.ts --json     # machine-readable violations
bun tooling/tree-conformance/check.ts --root DIR # audit another checkout or fixture
bun tooling/tree-conformance/check.ts --self-test
bun test tooling/tree-conformance
```

Exit codes: `0` clean, `1` violations (or a check that could not run), `2` usage error.

## The eight rules

| # | Name | What fires | What a human does |
| - | ---- | ---------- | ----------------- |
| 1 | `route-completeness` | A `Routes` entry has zero or several page modules; a page module has no default export or one that does not take `{ route }`; a `pages` entry has no `Routes` entry; a route is duplicated; a page module is bound to two routes; `src/router.tsx` is missing or unparsable. | Add the page, delete the orphan, or change the page to `export default function Page({ route }: { route: RouteDef })`. One route, one page module. |
| 2 | `feature-isolation` | A file under `src/features/a` imports (statically, dynamically, or via `require`) anything under `src/features/b`. | Move the shared code to `src/lib/` or a package. Test-only helpers belong in shared test support outside both feature trees. |
| 3 | `app-isolation` | One app imports another app, by relative path or by the other app's package name. | Move shared code to a package, or call the other deployment through its API/transport. |
| 4 | `package-direction` | A package imports an app; a package relative-walks into another package; any non-package file relative-walks into `packages/x/src/...`; an import uses a workspace subpath the package's `exports` map does not declare; a package manifest has an unreadable `exports`. | Import the package's declared name or subpath. If the surface is missing, ask the package owner to add it to `exports`; do not reach into the folder. |
| 5 | `no-authored-js` | A `.js` or `.jsx` file under any `src/`. | Delete it and author `.ts`/`.tsx`. Generated output belongs outside `src/`. |
| 6 | `one-main-per-route` | A page module (or a module on its default-export chain) declares `<main`, `createElement('main')`, or `jsx('main')`. | Remove the page-level main and render a `<section>` or fragment; the app shell owns the document's single main. |
| 7 | `size-budget` | A `src/**` `.ts`/`.tsx` file is over 600 lines and is not named in `SIZE_EXCEPTIONS`. | Split it by responsibility, or record a named exception with owner and reason in `src/rules.ts`. |
| 8 | `critical-route-guard` | A route with class `critical` has no test that sets up the no-session state, asserts a refusal or redirect, and contains an assertion. | Add a test in the route's feature that starts with no session and asserts the refusal (for example, the guard renders the sign-in prompt and not the protected content). |

Rules 1 and 6 read the route table; rule 8 reads both the route table and the test files. Rules 2,
3 and 4 share one import scanner that understands `import`/`export ... from`, bare `import '...'`,
dynamic `import(...)` and `require(...)`, with comments and template literals masked so a test that
embeds a fake import cannot create a false edge. Relative `.js` specifiers resolve to `.ts`/`.tsx`
the way the repo writes them.

Rule definitions, limits and size exceptions live in `src/rules.ts` so the checker, the README and
the self-test cannot drift.

## Size exceptions

`SIZE_EXCEPTIONS` is keyed by path relative to the repo root and maps to a reason plus owner:

```ts
export const SIZE_EXCEPTIONS: Readonly<Record<string, string>> = {
  'apps/web-public/src/features/analytics/events.ts': 'owner: analytics — generated event table, reviewed 2026-10',
};
```

An exception is a review decision, not a threshold change. The map is deliberately empty: files
currently over the limit are reported as findings, not blessed by this tool.

## `--self-test`

`--self-test` builds a control tree in the OS temp directory (three apps, two packages, eighteen
source files), proves it yields zero violations, then applies **one isolated injection per rule**
to a fresh copy of that tree. For each injection it requires exactly one violation of the expected
rule and zero violations of any other rule. It refuses to print OK unless a clean control passes
and all eight injections are caught by name.

The real repository is never read or written by the self-test; the test suite asserts that running
it leaves `tooling/tree-conformance` unchanged. The same `checkTree` function powers the normal run,
the self-test and the tests, so a rule cannot be green in one path and red in another.

## Layout

```
check.ts               CLI entry (bin)
src/rules.ts           rule metadata, size limit, markers, exceptions
src/scan.ts            one file walk, import scanner, router/package readers
src/context.ts         shared run context and violation shape
src/default-export.ts  default-export resolution through re-export seams
src/checks/routes.ts   rules 1, 6, 8
src/checks/boundaries.ts rules 2, 3, 4
src/checks/source.ts   rules 5, 7
src/checker.ts         orchestration and deterministic ordering
src/cli.ts             argument parsing, exit codes, reporting
src/fixture.ts         control tree and the eight injections
src/self-test.ts       temp-tree self-test
tests/checker.test.ts  proves clean input exits 0 and every injection exits 1
```

## When the gate fails

Read the violation, not the rule name. A finding is either a real defect in the tree or evidence
that the rule's definition is narrower than the product boundary it guards; in the second case the
controller decides. Do not edit `rules.ts` to make a real finding disappear, and do not add a size
exception without naming an owner and a reason.
