<?php

declare(strict_types=1);

namespace NasTech\Reporting\Export;

enum ExportFormat: string
{
    case Csv = 'csv';
    case Json = 'json';

    public function contentType(): string
    {
        return $this->value === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
    }
}
