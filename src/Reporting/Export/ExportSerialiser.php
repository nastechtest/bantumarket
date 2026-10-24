<?php

declare(strict_types=1);

namespace NasTech\Reporting\Export;

/**
 * Export serialisation. Deliberately dumb: it renders rows, it does not decide
 * access. The capability check is the HTTP edge's job; Reporting exposes the
 * bounded query and the row ceiling, and nothing here can raise either.
 */
final class ExportSerialiser
{
    /**
     * @param list<array<string,int|string|bool|null>> $rows
     * @param array<string,string> $columns
     */
    public function csv(array $rows, array $columns, bool $withHeader): string
    {
        $out = '';
        if ($withHeader) {
            $out .= implode(',', array_keys($columns)) . "\n";
        }
        foreach ($rows as $row) {
            $cells = [];
            foreach (array_keys($columns) as $column) {
                $cells[] = $this->cell($row[$column] ?? null);
            }
            $out .= implode(',', $cells) . "\n";
        }

        return $out;
    }

    /**
     * @param list<array<string,int|string|bool|null>> $rows
     */
    public function json(array $rows): string
    {
        return json_encode($rows, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }

    private function cell(int|string|bool|null $value): string
    {
        if ($value === null) {
            return '';
        }
        if ($value === true) {
            return 'true';
        }
        if ($value === false) {
            return 'false';
        }
        if (is_int($value)) {
            return (string) $value;
        }
        // A leading =, +, - or @ is a spreadsheet formula injection vector.
        $safe = preg_match('/^[=+\-@]/', $value) === 1 ? "'" . $value : $value;

        return '"' . str_replace('"', '""', $safe) . '"';
    }
}
