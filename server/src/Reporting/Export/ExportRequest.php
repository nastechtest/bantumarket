<?php

declare(strict_types=1);

namespace NasTech\Reporting\Export;

/**
 * A page request. The snapshot id is mandatory: an export that follows "latest"
 * can straddle a late event and emit two rows for one sale.
 */
final class ExportRequest
{
    public const MAX_PAGE_SIZE = 500;

    public function __construct(
        public readonly string $report,
        public readonly string $snapshotId,
        public readonly ExportFormat $format,
        public readonly int $pageSize = 200,
        public readonly ?string $cursor = null,
    ) {
        if ($pageSize < 1 || $pageSize > self::MAX_PAGE_SIZE) {
            throw new \InvalidArgumentException(sprintf(
                'Export page size must be between 1 and %d',
                self::MAX_PAGE_SIZE,
            ));
        }
    }
}
