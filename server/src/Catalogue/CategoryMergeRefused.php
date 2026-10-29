<?php

declare(strict_types=1);

namespace NasTech\Catalogue;

/**
 * A merge would leave a listing's current claim pointing at a category that is
 * no longer live.
 *
 * The fix is not to force the merge: it is to supply the answers that re-pin
 * each affected listing against the successor's frozen vocabulary. Refusing is
 * what makes "nothing is stranded" true rather than a sentence in a comment.
 */
final class CategoryMergeRefused extends CatalogueRefused
{
}
