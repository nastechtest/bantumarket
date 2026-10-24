<?php

declare(strict_types=1);

namespace NasTech\Tests\Support;

/**
 * A CHECK the test harness could not read. Thrown rather than skipped: an
 * expression evaluated as "passed" by a parser that never parsed it is how a
 * green suite comes to cover nothing.
 */
final class UnsupportedCheck extends \RuntimeException
{
}
