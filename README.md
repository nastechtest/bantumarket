# NasTech Market — Bantu Market

[![CI](https://github.com/nastechtest/bantumarket/actions/workflows/ci.yml/badge.svg)](https://github.com/nastechtest/bantumarket/actions/workflows/ci.yml)

A user-to-user second-hand marketplace for South Africa, built as a working vertical slice: three web
apps, nine shared packages, a PHP API, and a PostgreSQL schema that carries the money invariants.

The product's defining cost is that every listing is **captured** — photographed on a calibrated
turntable at the seller's station — and that capture is what the 0 % seller fee pays for. Everything
in this repository is arranged around that fact, including what it refuses to claim.

## Layout

| Path | What it is |
| --- | --- |
| `apps/web-public` | Buyer app: home, search, item, checkout, handover, dispute, inspection & 3D viewer |
| `apps/web-seller` | Seller app: onboarding, listings, capture queue, payouts |
| `apps/web-staff` | Staff app: reconciliation, payout operations, audit trail (see *Status*) |
| `packages/ui-3d` | Scene runtime, quality tiers, fallback, capture-assisted viewer |
| `packages/design-system` | Tokens, primitives, and the palette's own contrast contract |
| `packages/motion` | The animation layer, including reduced-motion behaviour |
| `packages/api-client`, `api-contracts` | Transport and the shared DTO/event contracts |
| `packages/testing` | The test harness: DOM, fake clock, a11y engine, fixtures |
| `tooling/asset-pipeline` | Capture custody, QC, renditions, manifests, budget checks |
| `tooling/tree-conformance` | Feature isolation, size budget, critical-route guard |
| `server/` | PHP 8.3 API: the money path, module boundaries, migrations, its own suite |
| `server/db/migrations` | PostgreSQL 16 DDL: ledger, captures, roles, messaging, reporting |

## Running it

```bash
bun install
bun run typecheck     # every workspace
bun run test          # ~1 900 tests
bun run check:tree    # feature isolation + size budget + critical-route guard
bun run check:all     # typecheck + tests + gates + payload budget
bun run build         # vite production builds for the three apps

cd server && ./bin/test          # PHP suite
cd server && ./bin/check-boundaries
```

Node is not required; Bun 1.3.14 is pinned in CI. PHP 8.3 is only needed for `server/`.

## CI

Eleven pipelines, each failing on something it can actually observe:

| Workflow | Proves |
| --- | --- |
| `ci.yml` | Typecheck, full suite, tree conformance, 3D fence — the required check |
| `tests-buyer.yml` | `web-public` suite, including the POPIA measurement fence |
| `tests-marketplace-apps.yml` | Seller and staff suites (matrix) |
| `tests-packages.yml` | One job per shared package, so a broken contract is named |
| `build-apps.yml` | Production bundle per app, uploaded as an artefact |
| `tests-3d-animation.yml` | Viewer + motion suites, and the fence self-test that injects a violation |
| `tests-layouts.yml` | Breakpoints, header/nav/layering, shells, the a11y engine |
| `php-server.yml` | `php -l` on every file, the PHP suite, module boundaries |
| `db-schema.yml` | Migrations applied to a real PostgreSQL 16 |
| `payload-budget.yml` | First-paint, scene chunk, and the NO_3D artefact carrying no renderer |
| `security.yml` | No committed secrets, no dependency advisories, no PII in an analytics prop |

## Status — what is real and what is not

Real, tested, and runnable: the buyer app end to end, the 3D inspection surface with a static
fallback, the design system and its accessibility engine, the analytics pipeline with consent gates
and a PII fence, the PHP money path, and the database invariants.

Not finished: much of `apps/web-staff` (reconciliation, payout operations, audit trail) and several
seller routes are placeholders that render honestly as placeholders. The PHP modules for
notifications, search, audit, payouts, HTTP and safety are not written yet, and their migrations
(`007`, `008`, `010`–`015`) are absent. The screens and modules that exist expect a live API; the
fixtures they run against are labelled as fixtures in the UI.

## Security posture

No card number, OTP, bank account, or survivor's detail is written to a log, audit payload, error
message or fixture. Bank details never travel in a URL. Staff impersonation is bounded and audited.
Analytics is closed-schema: a prop that cannot be expressed in the schema is rejected, and no
behavioural event leaves a device without an explicit consent decision.
