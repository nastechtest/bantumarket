<?php

declare(strict_types=1);

namespace NasTech\Tests\Reporting\Export;

use NasTech\Reporting\Export\ExportFormat;
use NasTech\Reporting\Export\ExportLimitExceeded;
use NasTech\Reporting\Export\ExportRequest;
use NasTech\Reporting\Export\InvalidExportCursor;
use NasTech\Reporting\Export\ReportExport;
use NasTech\Reporting\ReportName;
use NasTech\Reporting\Wiring;
use NasTech\Tests\Reporting\ReportingFixture;
use NasTech\Tests\TestCase;

/**
 * An export is the artefact that leaves the building, so it is bounded three
 * ways: a mandatory pinned snapshot, a hard row ceiling and a signed cursor.
 *
 * The tampering test is the negative one that matters. A plain base64 offset is
 * not a cursor: a client can edit it, skip a row and hand finance a CSV with a
 * hole in it. The signature binds report, snapshot and offset together.
 */
final class ExportTest extends TestCase
{
    private const SECRET = 'reporting-export-test-secret-0123456789';

    private ReportingFixture $fx;
    private ReportExport $export;

    public function setUp(): void
    {
        $this->fx = new ReportingFixture();
        foreach (['electronics' => 'lst_1', 'furniture' => 'lst_2', 'books' => 'lst_3'] as $category => $listing) {
            $this->fx->emit('ListingCreated', [
                'listing_id' => $listing,
                'seller_id' => ReportingFixture::SELLER,
                'category_id' => $category,
                'city' => 'Cape Town',
            ], '2026-11-02T08:00:00+00:00');
        }
        $this->export = Wiring::export($this->fx->store, self::SECRET);
    }

    public function testExportPagesThroughEveryRowWithASignedCursor(): void
    {
        $snapshot = $this->fx->snapshot();
        $first = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Json,
            pageSize: 1,
        ));

        $this->assertSame(1, $first->rowCount);
        $this->assertTrue($first->nextCursor !== null);
        $this->assertSame($snapshot->asOfIso(), $first->asOf);

        $second = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Json,
            pageSize: 1,
            cursor: $first->nextCursor,
        ));
        $this->assertSame(1, $second->rowCount);
        $this->assertSame($snapshot->asOfIso(), $second->asOf, 'every page states the same as-of');

        $third = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Json,
            pageSize: 1,
            cursor: $second->nextCursor,
        ));
        $this->assertSame(1, $third->rowCount);
        $this->assertSame(null, $third->nextCursor, 'the last page closes the export');

        $rows = array_merge(
            json_decode($first->body, true),
            json_decode($second->body, true),
            json_decode($third->body, true),
        );
        $this->assertCount(3, $rows);
    }

    public function testATamperedCursorIsRefused(): void
    {
        $snapshot = $this->fx->snapshot();
        $page = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Json,
            pageSize: 1,
        ));

        $tampered = substr($page->nextCursor, 0, -1) . (str_ends_with($page->nextCursor, 'A') ? 'B' : 'A');

        $this->assertThrows(
            InvalidExportCursor::class,
            fn () => $this->export->page(new ExportRequest(
                report: ReportName::ListingsCreated->value,
                snapshotId: $snapshot->id,
                format: ExportFormat::Json,
                pageSize: 1,
                cursor: $tampered,
            )),
            'signature does not verify',
        );
    }

    public function testACursorFromAnotherSnapshotIsRefusedEvenWhenSigned(): void
    {
        $first = $this->fx->snapshot();
        $page = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $first->id,
            format: ExportFormat::Json,
            pageSize: 1,
        ));

        $this->fx->advance('PT1M');
        $second = $this->fx->snapshot();

        $this->assertThrows(
            InvalidExportCursor::class,
            fn () => $this->export->page(new ExportRequest(
                report: ReportName::ListingsCreated->value,
                snapshotId: $second->id,
                format: ExportFormat::Json,
                pageSize: 1,
                cursor: $page->nextCursor,
            )),
            'different report or snapshot',
        );
    }

    public function testAnExportMustNameAClosedSnapshot(): void
    {
        $this->assertThrows(
            InvalidExportCursor::class,
            fn () => $this->export->page(new ExportRequest(
                report: ReportName::ListingsCreated->value,
                snapshotId: 'rpt_missing',
                format: ExportFormat::Csv,
            )),
            'must name a closed snapshot',
        );
    }

    public function testASecondPageAfterALateEventStillSeesThePinnedSnapshot(): void
    {
        $snapshot = $this->fx->snapshot();
        $first = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Json,
            pageSize: 2,
        ));

        $this->fx->advance('PT1M');
        $this->fx->emit(
            'ListingCreated',
            [
                'listing_id' => 'lst_late',
                'seller_id' => ReportingFixture::SELLER,
                'category_id' => 'sports',
                'city' => 'Cape Town',
            ],
            '2026-11-02T09:00:00+00:00',
            '2026-11-10T12:01:00+00:00',
        );

        $second = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Json,
            pageSize: 2,
            cursor: $first->nextCursor,
        ));

        $this->assertSame(1, $second->rowCount, 'the late row belongs to a new snapshot, not this export');
        $this->assertSame($snapshot->asOfIso(), $second->asOf);
    }

    public function testPageSizeIsBoundedAndTheCursorSecretIsNotOptional(): void
    {
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => new ExportRequest(ReportName::Gmv->value, 'rpt_1', ExportFormat::Csv, 0),
            'between 1 and',
        );
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => new ExportRequest(ReportName::Gmv->value, 'rpt_1', ExportFormat::Csv, ExportRequest::MAX_PAGE_SIZE + 1),
            'between 1 and',
        );
        $this->assertThrows(
            \InvalidArgumentException::class,
            fn () => Wiring::export($this->fx->store, 'short'),
            'at least 16 bytes',
        );
        $this->assertSame(50_000, ReportExport::ROW_CEILING);
    }

    public function testCsvWritesOneHeaderAndEscapesSpreadsheetFormulas(): void
    {
        $this->fx->emit('ListingCreated', [
            'listing_id' => 'lst_formula',
            'seller_id' => ReportingFixture::SELLER,
            'category_id' => '=HYPERLINK("https://bad.example")',
            'city' => 'Cape Town',
        ], '2026-11-02T09:00:00+00:00');

        $snapshot = $this->fx->snapshot();
        $page = $this->export->page(new ExportRequest(
            report: ReportName::ListingsCreated->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Csv,
            pageSize: 10,
        ));

        $this->assertSame(1, substr_count($page->body, 'category_id'), 'one header row per export');
        $this->assertStringContains("'=HYPERLINK", $page->body, 'a leading = must be neutralised');
        $this->assertFalse(str_contains($page->body, ',"=HYPERLINK'), 'the raw formula must not survive');

        $empty = $this->export->page(new ExportRequest(
            report: ReportName::Gmv->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Csv,
            pageSize: 10,
        ));
        $this->assertSame("currency,completed_orders,gmv_cents,refunded_cents,net_gmv_cents\n", $empty->body);
        $this->assertSame(null, $empty->nextCursor);
    }

    public function testJsonExportPreservesIntegerCents(): void
    {
        $this->fx->completedSale('ord_1', 129_900, 9_093, '2026-11-03T10:00:00+00:00', '2026-11-03T10:01:00+00:00');
        $snapshot = $this->fx->snapshot();

        $page = $this->export->page(new ExportRequest(
            report: ReportName::Gmv->value,
            snapshotId: $snapshot->id,
            format: ExportFormat::Json,
            pageSize: 10,
        ));
        $rows = json_decode($page->body, true);

        $this->assertSame(129_900, $rows[0]['gmv_cents']);
        $this->assertTrue(is_int($rows[0]['gmv_cents']), 'money must not arrive as a float');
    }

    public function testAnExportCeilingIsEnforcedRatherThanTruncatingSilently(): void
    {
        $this->assertTrue(ReportExport::ROW_CEILING > ExportRequest::MAX_PAGE_SIZE, 'the ceiling is larger than one page');

        $tiny = new ReportExport(
            $this->fx->catalogue,
            Wiring::snapshotRepository($this->fx->store),
            new \NasTech\Reporting\Export\ExportSerialiser(),
            self::SECRET,
            2,
        );
        $snapshot = $this->fx->snapshot();

        $this->assertThrows(
            ExportLimitExceeded::class,
            fn () => $tiny->page(new ExportRequest(
                report: ReportName::ListingsCreated->value,
                snapshotId: $snapshot->id,
                format: ExportFormat::Json,
                pageSize: 1,
            )),
            'exceeds the 2-row export ceiling',
        );
    }
}
