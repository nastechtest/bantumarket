# ADR-0001: Money invariants are enforced at commit time, by the transaction

Status: accepted, and load-bearing. Reopening this decision reopens the failure modes in
`03-nastech-market.modules.dot`.

Date: 2026-10-22
Context: `src/Settlements/MoneyInvariants.php`, `db/migrations/001_money_path.sql`,
`tests/Persistence/`, `src/Application/Kernel.php`

## Context

A marketplace's expensive bugs are not crashed pages. They are a seller paid twice, a
refund that returns the commission to the platform, a "paid" order with no money record
behind it. Each is a state that is individually plausible and jointly impossible. The
architecture review of the v1.0 specification listed five of them (§13, reproduced in the
module graph as `cluster_warning`), and every one of them is a *cross-record* condition:
no single row is invalid, the combination is.

The obvious place to check such a condition is the handler that creates it. That place is
wrong, for one reason:

> A commit-time guard that a handler registers can only detect that the handler forgot the
> thing the handler also does. It cannot detect the omission.

A guard is written by the same person, in the same file, in the same commit as the code it
is supposed to catch. When a sixth handler is added next quarter by someone who has not
read this document, the guard is not "forgotten" — it is never known to exist. The failure
is silent, because the handler's own logic is self-consistent.

Anything that bypasses the PHP bypasses a PHP guard entirely: a migration script, a
`psql` session with the wrong intent, a reporting job, a future service reading these
tables, a support tool that "just fixes the row".

## Decision

Install the five money invariants **once, on the unit of work**, so that every commit is
measured against them and no handler can be written that does not run them; and express
the same five a second time **inside the storage engine** as deferred constraint triggers.

```php
// src/Application/Kernel.php — before anything can commit
MoneyInvariants::install($uow, $store);
```

```sql
-- db/migrations/001_money_path.sql
CREATE CONSTRAINT TRIGGER invariant_paid_order_has_ledger
    AFTER INSERT OR UPDATE OF status ON orders.orders
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION settlements.invariant_paid_order_has_ledger();
```

The two are not redundant. They fail differently: the PHP one gives a readable message and
a clean rollback to the code that caused it, before the round trip; the SQL one holds for
transactions that never touch this PHP.

### The five rules

| # | Rule | PHP | PostgreSQL |
| --- | --- | --- | --- |
| 1 | A state only reachable after money moved has at least one ledger row | `MoneyInvariants::check()` | `invariant_paid_order_has_ledger` |
| 2 | Seller earnings are never credited without a `FORWARD` commission entry | same | `invariant_earnings_have_evidence` |
| 3 | A refund nets the commission to zero | same | `invariant_refund_reverses_commission` |
| 4 | A closed order holds no money | same | `invariant_closed_order_has_no_hold` **and** `invariant_hold_released_on_closed_order` |
| 5 | No seller balance is ever negative | same | `invariant_balance_never_negative` |

Rule 4 is two triggers, not one. The violation is reachable from either side — the order
closing while a hold is open, and the hold being written against an already-closed order —
and the two rows have different shapes. One function branching on `TG_TABLE_NAME` to cover
both read `NEW.id` from the wrong table and reported a ledger id where an order id was
needed. Two functions, each reading its own row, is the honest version of that.

### Why "deferred" is the whole mechanism

A payment transaction legitimately writes a ledger row before it writes the order state
that justifies it. A per-statement check would refuse the first row and no legal ordering
of the writes would satisfy it. `DEFERRABLE INITIALLY DEFERRED` evaluates at commit, which
is the moment the transaction becomes true — so the order of writes inside a transaction
cannot matter. That property is the reason the invariant is a *transaction* rule and not a
*statement* rule, and it is why the PHP checker runs on `commit()` rather than on `save()`.

## Alternatives considered, and why they lose

**Checks inside each handler.** Defeated by the next handler. Also the only version of this
that requires a human to remember, at the exact moment they are focused on something else.

**Domain events or entity callbacks** (`onOrderPaid` fires the check). Fires only when the
entity is loaded and saved as an entity. A bulk update, a repair script and a future
service all move the row without producing the event, and all three are legitimate ways to
break rule 1.

**PostgreSQL only.** Correct, but the application then learns about a violated invariant as
a `check_violation` from inside `commit()`, having already paid the round trip and lost the
context of which handler did it. The error class is a database error rather than a domain
one. Cheap to add on top; bad as the only layer.

**PHP only.** This is what most teams ship, and it is what makes the modular monolith look
optional: if the rule lives in the application, the application is the only thing that can
be trusted to write these rows — which forecloses every operational tool, migration and
future extract, permanently.

**"Eventual consistency plus a reconciliation job."** Rejected outright, and this is the
decision the v1.0 §13 microservice split would have forced. Making reconciliation a nightly
job rather than a constraint means the system's normal state includes money in an
impossible configuration, and the discovery path is a report someone reads the next day.
The seller finds out first, by disputing a payout. `ReconcileSettlementFile` exists here to
compare our ledger against the *provider's* settlement file — an external boundary we do
not control — and not as a substitute for an invariant we do.

## Consequences

**Bought**

- Rule-violating code fails at the first commit that violates it, in the test that added
  it, with a sentence naming the order and the state.
- The invariant cannot be bypassed by a handler, because it is not reachable from one.
  The same guarantee is re-declared at the storage layer for writes that never reach the
  handler at all.
- Escrow becomes expressible as an invariant rather than a policy. `HOLD` at payment and
  `HOLD_RELEASE` at completion make rule 4 mechanically checkable: a completed order with
  a non-zero hold sum is not a business exception, it is a failed commit.
- A reviewer can read one table of rules and know what the system promises about money.
  That table is the closest thing this project has to a contract with sellers.

**Cost, stated honestly**

- `MoneyInvariants::check()` scans every order row and re-indexes the whole ledger on each
  commit: O(orders + ledger_entries) per transaction. With three-row test fixtures that is
  free, and it is the reason nobody has noticed. At launch volume it is a full scan inside
  the hottest path in the system, and it will need to become scoped to the aggregates this
  transaction touched — which means the checker has to record what it dirtied, or read the
  same diff the unit of work already holds. That is a real change, and the deferred trigger
  version does not have the problem: it runs per row, against an index.
- Invariants that span two tables are harder to unit-test than handlers, because the fixture
  has to commit. `tests/MoneyPath/InvariantTest.php` exists for exactly that reason.
- The same rule now exists twice, in two languages. Drift between the two is a genuine risk,
  and it is the reason `tests/Persistence/SchemaParityTest.php` and
  `tests/Persistence/MoneyPathRowsSatisfyTheDdlChecksTest.php` are as large as they are.
  Doubling the enforcement surface also doubles the surface on which the two can disagree.
- Anything that writes these tables must satisfy the invariants, including a support tool
  written in an emergency at 2am. This is intended. It is also the thing that will be
  resented, and the answer is a properly designed correction path (a reversing row, which
  the append-only tables already require) rather than a relaxed rule.

## How the decision is being verified

Three layers, each falsified on purpose before being trusted:

1. **Behaviour.** `tests/MoneyPath/InvariantTest.php` proves each rule fires on the state
   transition that violates it and stays quiet on the ones that do not. Two of those tests
   reach rules 4 and 5 with no handler in the path at all: they write a violating ledger row
   directly, register no guard, and rely on the commit alone. They were added because rules
   4 and 5 had previously only been exercised through `RequestPayout`, whose own guard fires
   first — so the suite was green while the claim this ADR rests on was untested. A guard
   that catches the violation before the transaction does proves the guard works; it says
   nothing about whether the transaction would have.
2. **Declaration.** `SchemaParityTest` compares the DDL against the model for tables,
   columns (derived by running the money path and reading what it inserted, not from a
   maintained list), append-only triggers, unique indexes, the named rules in
   `Schema::ROW_CHECKS`, and the enumerated vocabularies. It was injected with an added
   column and a deleted trigger and failed on both.
3. **Semantics.** `MoneyPathRowsSatisfyTheDdlChecksTest` feeds every real row, forward
   commission and reversal alike, through every `CHECK` expression in the migration. This
   layer is what found two commission checks that rejected every refund row on a real
   server — a defect the first two layers structurally cannot see, because the constraint
   was correctly declared and simply wrong.

**What none of this proves.** The SQL has never been parsed or executed: this environment
has no PostgreSQL and no PDO driver. The deferred triggers' commit-time behaviour, the
`btree_gist` exclusion, the grant set and the DDL's syntax are all asserted, not observed.
`psql -v ON_ERROR_STOP=1` against a real cluster, then a test that violates each invariant
from `psql` directly, is a gate on this ADR, not a follow-up.

## Revisit when

- The commit-time scan shows up in a profile. Scope the checker to the transaction's own
  writes; do not relax a rule to make it cheaper.
- A second service genuinely needs to write these tables. That is the trigger for the
  outbox-and-saga design this ADR avoids, and it should be argued as a new ADR rather than
  quietly assumed by an infrastructure change.
- Multi-currency. Rule 5 ("no negative balance") silently becomes "no negative balance
  *per currency*", which is a different promise to a seller and needs to be said out loud
  before it is coded.
