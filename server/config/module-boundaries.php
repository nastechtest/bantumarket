<?php

declare(strict_types=1);

/**
 * Module boundaries, as data.
 *
 * Derived from 03-nastech-market.modules.dot, which is the source of truth for the
 * architecture argument. A module may import SharedKernel (the foundation layer
 * beneath every module) and anything listed against it here. Anything else is a
 * violation and fails the build.
 *
 * Every rationale is a quote or a reading of an edge in the graph. When an edge is
 * added to the graph, it is added here in the same change — which is the point of
 * having it as data rather than as a paragraph somebody has to remember.
 */
return [
    // The composition root is the one place allowed to know every module at once.
    // It wires; it decides no business rule, so it enforces none either.
    'Application' => [
        '*' => 'composition root — the only file permitted to see all modules',
    ],

    // The foundation: depended on by everyone, depends on nobody.
    'SharedKernel' => [],

    'Listings' => [
        'Identity' => 'ownership check: only the verified seller may edit or withdraw',
        'Catalogue' => 'a listing is only valid against a real category and its attributes',
        'Media' => 'a listing attaches media it owns; the reference points at media, never the reverse',
        // cataloguelistings used to have no way to prove ownership at all — identity
        // arrived after the money path. Add edges here, never loosen anything else.
    ],

    'Orders' => [
        'Listings' => 'CreateOrder reads the listing to copy category and price',
        'Settlements' => 'orders -> db: state + ledger in ONE transaction (dot line 75)',
        'Identity' => 'the buyer and seller must be real, verified, non-sanctioned accounts',
    ],

    'Payments' => [
        'Orders' => 'payments -> orders: verified provider event advances state ONCE (dot line 45)',
        'Commissions' => 'payments -> commissions: confirmed amount to policy evaluation (dot line 46)',
        'Settlements' => 'the payment transaction writes the ledger row it books, or not at all',
        'Identity' => 'a payment event is only trustworthy if the payer is the buyer on the order',
    ],

    'Commissions' => [
        // Note what is deliberately absent: no Orders. The commission engine is
        // handed a CommissionableSale, not the Order aggregate, so it cannot read
        // or move order state. The graph edge is orders -> commissions, one way.
        'Settlements' => 'commissions -> settlements: CommissionEntry ties to Payout (dot line 47)',
    ],

    'Settlements' => [
        'Orders' => 'settlements reads order state to decide what is payable',
        'Commissions' => 'settlements -> payments + the refund rule: a refunded sale must reverse its commission',
        'Payouts' => 'a settled entry becomes a payout instruction, one way',
    ],

    'Handover' => [
        'Orders' => 'handover -> orders: handover confirmed advances state (dot line 52)',
        // And never payments: a PIN is not a payment (dot line 53). If this ever
        // grows a Payments entry, the checker is the thing that says no.
    ],

    // ---------------------------------------------------------------------------
    // Registered before wave D was dispatched, so a new module starts green and
    // the checker stays a gate rather than a chore. Every edge below is an argument
    // about direction; delete one and the modules that need it will say so loudly.
    // ---------------------------------------------------------------------------

    // The thing every module may name and which names none of them. If Identity ever
    // grows an edge outwards, authentication has started making business rules.
    'Identity' => [],

    // Images and 3D renditions. Knows nothing about why a thing is listed. ADR 0002:
    // media is PHP-side, because an asset that cannot be counted is an asset that
    // cannot be reconciled against the R270 it cost to capture.
    'Media' => [],

    'Capture' => [
        'Media' => 'a passed capture publishes its renditions, poster and sprite through Media only',
        'Identity' => 'a capture job has a named operator and a chain of custody',
    ],

    'Disputes' => [
        'Orders' => 'a dispute is raised against an order, and only in a disputable state',
        'Listings' => 'the claim scope and the written disclosures are read from the listing as it stood',
        'Identity' => 'only the two parties to the order may see or add to a case',
    ],

    'Safety' => [
        'Listings' => 'a takedown applies to a listing',
        'Identity' => 'a sanction applies to an account',
        'Orders' => 'a report may cite an order as its context',
    ],

    'Messaging' => ['Identity' => 'a thread exists between verified accounts and honours their contact consent'],

    // Notifications is deliberately alone: it reacts to outbox events and to nothing
    // else. If it ever imports Orders to "check the status first", every business rule
    // has two owners and the outbox was wasted.
    'Notifications' => ['Identity' => 'which channel, at which address, with which consent'],

    // The search index projects other modules' data; it is never read back by them.
    'Search' => [
        'Listings' => 'the index is a projection of listing state',
        'Catalogue' => 'facets come from the taxonomy, not from whatever strings sellers typed',
        'Media' => 'a result tile needs the poster and the turntable sprite',
    ],

    'Catalogue' => [],

    // Read models are SQL views over module schemas. 'Reporting' => [] is the whole
    // point: the moment a report needs a PHP class from a module, the report is
    // computing a business rule in the wrong place and will disagree with the ledger.
    'Reporting' => [],

    // Append-only, written through a SharedKernel sink. It may not reach back into
    // anybody, and nobody may reach into it — audit is a place events go, not a service.
    'Audit' => [],

    'Payouts' => [
        'Settlements' => 'a payable batch is built from settled commission and payout entries',
        'Identity' => 'money leaves to the bank details on the verified account holder, matched or refused',
    ],

    // The HTTP edge routes, validates and serialises. It gets the composition root's
    // wildcard for the same reason and under the same condition: it decides no rule.
    // That condition is not machine-checked, so it is a standing review obligation.
    'Http' => ['*' => 'entry point: routes to a module command, serialises a module result'],
];
