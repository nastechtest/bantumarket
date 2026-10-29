<?php

declare(strict_types=1);

namespace NasTech\Safety;

/**
 * A Safety command was asked for a decision the module will not make.
 *
 * One exception for the whole module, because every refusal here has the same
 * shape: the caller is told which rule stopped it in a sentence it can act on,
 * and never the report body it was trying to read or write.
 */
class SafetyRuleViolation extends \RuntimeException
{
}
