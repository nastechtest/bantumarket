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
        // cataloguelistings reads identityaccess for the ownership check (dot line 69),
        // but identity-access is not built yet. When it is, add
        // 'Identity' => 'ownership check' here rather than loosening anything else.
    ],

    'Orders' => [
        'Listings' => 'CreateOrder reads the listing to copy category and price',
        'Settlements' => 'orders -> db: state + ledger in ONE transaction (dot line 75)',
    ],

    'Payments' => [
        'Orders' => 'payments -> orders: verified provider event advances state ONCE (dot line 45)',
        'Commissions' => 'payments -> commissions: confirmed amount to policy evaluation (dot line 46)',
        'Settlements' => 'the payment transaction writes the ledger row it books, or not at all',
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
    ],

    'Handover' => [
        'Orders' => 'handover -> orders: handover confirmed advances state (dot line 52)',
        // And never payments: a PIN is not a payment (dot line 53). If this ever
        // grows a Payments entry, the checker is the thing that says no.
    ],
];
