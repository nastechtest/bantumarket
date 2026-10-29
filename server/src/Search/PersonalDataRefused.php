<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * The projection was handed something that belongs to a person, not to an item.
 *
 * Search is the most widely read table in the platform. A seller's name, phone
 * number, email, address, suburb or exact location must therefore never reach
 * it: personal data belongs to Identity and the order/handover records, where
 * access is authorised per party. The refusal is by field name as well as by
 * content (a phone number typed into a title), because either route would put
 * the same data in the same index.
 */
final class PersonalDataRefused extends SearchProjectionRefused
{
}
