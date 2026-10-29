<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * A refusal from the catalogue write/validation path.
 *
 * Legal-shaped input that the taxonomy will not accept, for a reason stated in
 * the message. It is a DomainException rather than a runtime failure because the
 * storage was not wrong — the request was. The HTTP edge maps it to a 4xx, and
 * the message is user-facing copy: it names the rule, never an internal id.
 */
class CatalogueRefused extends \DomainException
{
}
