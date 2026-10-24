<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * A read URL that does not entitle the caller to the bytes it names.
 *
 * Signature, expiry, purpose and audience are one decision with four causes, and
 * the caller is told the same sentence either way: which claim failed is a fact
 * about the platform's keys and must not be an oracle for someone probing URLs.
 * The reason lands in the log, not the response.
 */
final class ReadScopeRefused extends \DomainException
{
}
