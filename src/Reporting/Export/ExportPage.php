<?php

declare(strict_types=1);

namespace NasTech\Reporting\Export;

/**
 * One bounded page. `nextCursor` is null on the last page; `asOf` is carried on
 * every page so a concatenated file cannot silently mix snapshots.
 */
final class ExportPage
{
    public function __construct(
        public readonly string $report,
        public readonly string $snapshotId,
        public readonly string $asOf,
        public readonly ExportFormat $format,
        public readonly string $body,
        public readonly int $rowCount,
        public readonly ?string $nextCursor,
    ) {
    }
}
