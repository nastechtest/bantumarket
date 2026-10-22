# NasTech Market — Phase 0 money path (PHP)

The part of the marketplace that holds money: order state, payment capture, commission
pricing, the ledger, refunds, payouts, handover and reconciliation. It is the money path
from `NasTech_Market_Master_Specification.md`, built as the vertical slice
`../NasTech-Market-Plan/04-phase-0-3-launch-plan.md` calls Phase 0.

Language: PHP 8.3. No framework. One process, one logical database, module seams enforced
by a checker rather than by convention.

```
./bin/test                        # 95 tests, 1,600 assertions
./bin/check-boundaries            # 8 modules, 0 violations
./bin/check-boundaries --self-test  # proves the checker detects what it claims to
```

`bin/test <substring>` filters by class or method name; `--verbose` lists every test
rather than only the failures. Both runners exit non-zero on any problem, so they are
usable as CI gates exactly as they stand.

## Why there is no Composer

This environment's PHP is built without `ext-dom` and `ext-mbstring`, both of which the
Composer binary requires, so `composer install` cannot run. The consequence is that
nothing third-party is used or claimed here:

| Would normally be | Is instead |
| --- | --- |
| `nesbot/carbon`, `ramsey/uuid` | `SharedKernel/Clock.php`, `FrozenClock`, `Id.php` (55 lines) |
| PHPUnit | `tests/TestCase.php` — eight assertions plus `fail`, its own runner in `bin/test` |
| `ramsey/uuid-doctrine`, Eloquent | a hand-rolled PSR-4 loader in `bin/autoload.php` |
| Deptrac or PHPAT for module boundaries | `bin/check-boundaries`, over 342 lines on `token_get_all` |
| Laravel/Symfony + Doctrine migrations | `db/migrations/*.sql`, applied by `psql` |
| an in-memory or sqlite DBAL for tests | `SharedKernel/Persistence/InMemoryStore`, which enforces the same append-only and unique-index rules the DDL does |

When Composer becomes available the intended additions are PHPUnit (to retire
`bin/test`), Deptrac (to retire the hand-rolled checker) and a real Postgres-backed
store behind the existing `Store` interface. None of them changes a rule in `src/`.

## Layout

```
src/SharedKernel/       14 files   993 lines  Money, Id, Clock, StateMachine, Outbox, persistence
src/Settlements/        11 files   993 lines  Ledger, MoneyInvariants, refunds, payouts, reconciliation
src/Handover/            7 files   549 lines  token, PIN, QR-facing confirmation, attempt limits
src/Commissions/         7 files   520 lines  policy, registry, recorder, CommissionEntry evidence
src/Orders/              5 files   453 lines  Order aggregate, state machine, create/complete
src/Payments/            6 files   447 lines  webhook verify, inbox, record payment
src/Listings/            2 files   106 lines
src/Application/         1 file    123 lines  Kernel — the composition root
tests/                  14 files 3,473 lines
db/migrations/           2 files   742 lines
config/                  1 file     61 lines  the module boundary rules
bin/                     3 files   492 lines  test, check-boundaries, autoload
```

`src/Application/Kernel.php` is the only file that sees every module. It wires
dependencies and decides no business rule; the boundary rules in
`config/module-boundaries.php` grant it that exception explicitly.

## The one design decision this code is built around

**Money invariants are installed at the transaction layer, not in the handlers.**

`MoneyInvariants::install()` is called in the `Kernel` constructor, before anything can
commit. Every commit is measured against the five rules; a handler cannot opt out because
a handler has no way to know the checks exist. The full argument, the alternatives
rejected and what this does not buy is in
[docs/adr/0001-commit-time-invariants.md](docs/adr/0001-commit-time-invariants.md).

The five rules, each of which is the failure a marketplace actually has:

1. A state that only exists after money moved has a ledger row.
2. Seller earnings are never credited without the commission evidence that says why.
3. A refund reverses the commission.
4. A closed order holds no money.
5. No seller balance is ever negative.

Escrow is what makes 4 work: `HOLD` at payment, `HOLD_RELEASE` at completion, so a
seller's payable balance is zero while the goods are in transit and the money is only
spendable once the handover is confirmed by both sides.

## What is enforced, and where

The same rule exists in two places on purpose, because the two places fail differently.

| Rule | PHP | PostgreSQL |
| --- | --- | --- |
| append-only evidence (`ledger_entries`, `commission_entries`, `provider_events`, `seen_webhook_signatures`, `payout_requests`) | `InMemoryStore::enforceAppendOnly` | `BEFORE UPDATE OR DELETE` triggers + a grant that withholds UPDATE/DELETE from the app role |
| idempotency (event claim, one commission per order+kind, one reversal per entry, spent payout key, seen signature) | unique-index emulation in the store | `CREATE UNIQUE INDEX` |
| the five money invariants | commit-time checker on the unit of work | `DEFERRABLE INITIALLY DEFERRED` constraint triggers |
| row arithmetic (net = gross − commission on a forward entry, sign follows kind, parent pointer follows kind, PIN is a digest, ≤ 5 attempts) | `CommissionEntry`'s constructor | named `CHECK` constraints listed in `Schema::ROW_CHECKS` |
| order state machine | `Order::TRANSITIONS`, deny-by-default | deliberately **not** duplicated — the value set is constrained, the transitions are not |
| module boundaries | `bin/check-boundaries` over `token_get_all` | schema-per-module plus grants |

A pre-check-then-write is not used anywhere for idempotency. Every claim is a unique
index, because a pre-check has a window between reading and writing and an index does
not. Optimistic locking is a compare-and-swap against the version the caller already
loaded, and `shared.assert_order_version_monotonic()` additionally refuses any update
that does not move the version forward — so a stale aggregate is rejected even by code
that forgot to compare.

## Verification: what has been run, and what has not

Run and green in this tree:

- 95 tests, 1,600 assertions, over the payment, commission, handover, refund, payout and
  reconciliation paths.
- `bin/check-boundaries --self-test`, which injects `Commissions → Handover` and
  `Commissions → Payments` imports into a throwaway file and requires the count to move
  by exactly the injected number before it reports anything about the clean tree.
- Three deliberate drift injections against the migration, each caught by the test named
  for it: an invented listing vocabulary, a named `CHECK` deleted, and a sign flipped.
- All five money invariants proved at the transaction layer, including two tests that
  write a violating ledger row directly and register no guard, so the only thing left
  standing is the commit-time check. Rules 4 and 5 had previously only been reached
  through `RequestPayout`'s own guard, which fires first and therefore proved the wrong
  thing.

**Not run: the SQL.** There is no PostgreSQL and no PDO driver in this environment, so
`db/migrations/*.sql` has never been parsed by the thing it is written for. Two test
files exist in place of running it, and they are not the same as running it:

- `tests/Persistence/SchemaParityTest.php` — the DDL and the model declare the same
  tables, columns, append-only triggers, unique indexes, named row rules and enumerated
  vocabularies. Columns are derived by running the money path and reading what it
  inserted, not from a maintained list.
- `tests/Persistence/MoneyPathRowsSatisfyTheDdlChecksTest.php` — every row the money path
  writes is fed through every row `CHECK` on its table, evaluated by a narrow
  expression reader (`tests/Support/DdlRowChecks.php`) that raises on any construct it
  does not model rather than guessing. This is what found three real defects: two
  commission checks that rejected every refund row, and two enum lists that had been
  written from what the values sounded like rather than from the code.

Still unproven, and each of these needs `psql -v ON_ERROR_STOP=1` against a real cluster:
that the SQL parses at all; that the `btree_gist` exclusion behaves; that the deferred
constraint triggers fire at commit rather than per statement; that the grants bind as
described. Treat this as a required gate before any deploy, not a formality.

## Not built yet

Said plainly, because "it looks finished" is the failure mode of a slice like this.

- **No HTTP layer.** No router, no controllers, no JSON, no status codes. Handlers are
  called from tests today. `WebhookRejected` exists so the future HTTP layer has a 4xx
  to map, and nothing more.
- **No identity, no authn, no authorisation.** `buyer_id` and `seller_id` are strings a
  test supplies. There is no session, no passkey, no MFA, no permission check, and no
  step-up before a payout — so the money path currently trusts whoever calls it. This is
  the `identity-access` module, and it is a launch gate, not an enhancement.
- **No real provider.** `payfast-sim` is an event shape. No adapter, no TLS pinning, no
  settlement-file fetch.
- **`commissions.policies` is DDL-only.** The registry is built in memory from
  `Kernel`'s constructor. Nothing reads rates from the database yet.
- **`CHARGEBACK` is a ledger entry type with no handler.** The rule that keeps a
  chargeback from leaving a negative balance is enforced; the flow that creates one is
  not written.
- **Outbox delivery is synchronous in-process.** At-least-once, retry and dead-letter are
  a worker that does not exist yet.
- **Module boundary rules cover `src/`, not `tests/`.** Test fixtures may reach anywhere
  by design; nothing enforces that they stay inside the fixture layer.
- **No legal review.** POPIA s.18 security controls, s.21 assistance, s.26 operator
  agreements, s.72 breach notification, ECT Act s.15 order records and the FIC Act
  obligations are all spec-level commitments with no code behind them. Nothing here has
  been read by a South African payments or privacy lawyer.
- **No observability, no backups, no CI.** The audit trail, retention, and the
  dispute/chargeback tooling are Phase 1+.

Roughly 8,950 lines of code and SQL, of the ~289,500 the launch estimate carries. That is
the money path, not the product.
