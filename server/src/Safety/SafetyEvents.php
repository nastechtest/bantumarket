<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * Event names Safety puts on the outbox.
 *
 * Messaging already consumes ContactBlocked; keeping the name here rather than
 * in a string at the call site is what lets the two modules agree without
 * importing each other's classes. No payload of any of these events carries a
 * report body.
 */
final class SafetyEvents
{
    public const REPORT_FILED = 'ReportFiled';
    public const CONTACT_BLOCKED = 'ContactBlocked';
    public const SANCTION_PROPOSED = 'SanctionProposed';
    public const SANCTION_APPLIED = 'SanctionApplied';

    private function __construct()
    {
    }
}
