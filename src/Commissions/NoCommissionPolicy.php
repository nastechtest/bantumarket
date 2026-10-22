<?php

declare(strict_types=1);

namespace NasTech\Commissions;

/**
 * A category has exactly one policy at any instant, or the platform does not
 * know what it charges. Both failure modes are refused here rather than left to
 * a scheduled job that quietly prices history wrong.
 */
final class NoCommissionPolicy extends \DomainException
{
}
