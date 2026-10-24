<?php

declare(strict_types=1);

namespace NasTech\Media;

/**
 * A media operation the module will not perform.
 *
 * The HTTP layer's 4xx to map, in the same shape as WebhookRejected: the module
 * says no in one class, and the reason is a sentence a seller or an operator can
 * act on.
 */
final class MediaRefused extends \DomainException
{
}
