<?php

declare(strict_types=1);

namespace NasTech\Safety;

final class ReportNotFound extends \RuntimeException
{
    public static function withId(string $reportId): self
    {
        return new self("No safety report {$reportId} exists");
    }
}
