<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * A query the index will not answer.
 *
 * This is a refusal, not a validation warning. A search that quietly drops a
 * filter returns a result set the buyer did not ask for and cannot tell apart
 * from the one they did, so every unknown or malformed part of a query stops
 * here rather than being ignored downstream.
 */
class InvalidSearchQuery extends \InvalidArgumentException
{
}
