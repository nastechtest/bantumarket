<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * What a rebuild did, in counts an operator can compare to the source's own
 * count. `unchanged` is the idempotence evidence: re-running a rebuild over the
 * same versions indexes nothing and rewrites nothing.
 */
final class RebuildReport
{
    public function __construct(
        public readonly int $scanned,
        public readonly int $indexed,
        public readonly int $unchanged,
    ) {
    }

    /**
     * @return array<string,int>
     */
    public function toArray(): array
    {
        return [
            'scanned' => $this->scanned,
            'indexed' => $this->indexed,
            'unchanged' => $this->unchanged,
        ];
    }
}
