<?php

declare(strict_types=1);

namespace NasTech\Tests\Safety;

use NasTech\Safety\PersonalDataRefused;
use NasTech\Safety\ReportReason;
use NasTech\Safety\ReportState;
use NasTech\Safety\ReportSubjectType;
use NasTech\Safety\ReportView;
use NasTech\Safety\SafetyEvents;
use NasTech\Safety\SafetyRuleViolation;
use NasTech\Tests\Safety\Support\SafetyFixture;
use NasTech\Tests\TestCase;

/**
 * The report rules that matter most: a closed reason vocabulary, a body that
 * cannot carry identity data, and a body that never reaches the account it is
 * about.
 */
final class ReportSafetyTest extends TestCase
{
    public function testTheReasonVocabularyIsClosedAndTheSubjectVocabularyIsExact(): void
    {
        $fixture = new SafetyFixture();

        $this->assertSame(7, count(ReportReason::ALL));
        $this->assertSame(4, count(ReportSubjectType::ALL));
        $this->assertTrue(ReportReason::isValid(ReportReason::SCAM));
        $this->assertFalse(ReportReason::isValid('FRAUD'));

        $this->assertThrows(
            SafetyRuleViolation::class,
            fn () => $fixture->service->fileReport(
                $fixture->reporter->id,
                ReportSubjectType::SELLER,
                $fixture->reported->id,
                $fixture->reported->id,
                'FRAUD',
                'The seller took my money.',
            ),
            'closed',
        );
        $this->assertCount(0, $fixture->store->all('safety_reports'));
    }

    public function testAReportStartsOpenAndCarriesItsClassification(): void
    {
        $fixture = new SafetyFixture();

        $report = $fixture->service->fileReport(
            $fixture->reporter->id,
            ReportSubjectType::LISTING,
            'lst_123',
            $fixture->reported->id,
            ReportReason::COUNTERFEIT,
            'The watch is described as authentic but the case back serial does not match.',
        );

        $this->assertSame(ReportState::OPEN, $report->state);
        $this->assertSame(ReportSubjectType::LISTING, $report->subjectType);
        $this->assertSame(ReportReason::COUNTERFEIT, $report->reason);
        $this->assertCount(1, $fixture->store->all('safety_reports'));
    }

    public function testTheBodyIsReturnedToTheReporterAndStaffButNeverToTheReportedParty(): void
    {
        $fixture = new SafetyFixture();
        $body = 'The seller demanded an EFT outside the app after I refused.';

        $report = $fixture->service->fileReport(
            $fixture->reporter->id,
            ReportSubjectType::SELLER,
            $fixture->reported->id,
            $fixture->reported->id,
            ReportReason::OFF_PLATFORM,
            $body,
        );

        $byReporter = $fixture->service->readReport($report->id, $fixture->reporter->id);
        $this->assertSame($body, $byReporter->body);
        $this->assertSame(ReportView::VISIBLE_TO_REPORTER, $byReporter->bodyVisibility);

        $byStaff = $fixture->service->readReport($report->id, $fixture->staff->id);
        $this->assertSame($body, $byStaff->body);
        $this->assertSame(ReportView::VISIBLE_TO_STAFF, $byStaff->bodyVisibility);

        $byReported = $fixture->service->readReport($report->id, $fixture->reported->id);
        $this->assertSame(null, $byReported->body);
        $this->assertTrue($byReported->bodyWasWithheld());
        $this->assertSame(ReportView::WITHHELD_FROM_REPORTED_PARTY, $byReported->bodyVisibility);

        $byStranger = $fixture->service->readReport($report->id, $fixture->stranger->id);
        $this->assertSame(null, $byStranger->body);
        $this->assertSame(ReportView::WITHHELD_FROM_OTHER, $byStranger->bodyVisibility);
    }

    public function testAStaffMemberWhoIsTheReportedPartyStillDoesNotGetTheBody(): void
    {
        $fixture = new SafetyFixture();

        $report = $fixture->service->fileReport(
            $fixture->reporter->id,
            ReportSubjectType::SELLER,
            $fixture->staff->id,
            $fixture->staff->id,
            ReportReason::HARASSMENT,
            'The seller kept messaging after being asked to stop.',
        );

        $view = $fixture->service->readReport($report->id, $fixture->staff->id);
        $this->assertSame(null, $view->body);
        $this->assertSame(ReportView::WITHHELD_FROM_REPORTED_PARTY, $view->bodyVisibility);
    }

    public function testTheReportEventCarriesNoBody(): void
    {
        $fixture = new SafetyFixture();
        $body = 'The seller demanded an EFT outside the app after I refused.';

        $fixture->service->fileReport(
            $fixture->reporter->id,
            ReportSubjectType::SELLER,
            $fixture->reported->id,
            $fixture->reported->id,
            ReportReason::OFF_PLATFORM,
            $body,
        );

        $event = null;
        foreach ($fixture->outbox->dispatched() as $candidate) {
            if ($candidate['event_type'] === SafetyEvents::REPORT_FILED) {
                $event = $candidate;
            }
        }

        $this->assertNotSame(null, $event, 'a ReportFiled event was published');
        $this->assertFalse(isset($event['payload']['body']), 'the outbox payload has no body key');
        $this->assertFalse(
            str_contains((string) json_encode($event['payload']), $body),
            'the narrative text is absent from the outbox payload',
        );
    }

    public function testPersonalDataShapesAreRefusedBeforeAnythingIsStored(): void
    {
        $fixture = new SafetyFixture();

        $cases = [
            PersonalDataRefused::PHONE_NUMBER => 'Call me on 082 123 4567 to arrange it.',
            PersonalDataRefused::ID_NUMBER => 'My identity number is 9001015800087.',
            PersonalDataRefused::CARD_NUMBER => 'The card 4111 1111 1111 1111 was charged.',
            PersonalDataRefused::STREET_ADDRESS => 'I live at 12 Main Street, Cape Town.',
            PersonalDataRefused::SURVIVOR_DETAIL => 'I am a survivor and do not want this shared.',
        ];

        foreach ($cases as $category => $body) {
            $thrown = $this->assertThrows(
                PersonalDataRefused::class,
                fn () => $fixture->service->fileReport(
                    $fixture->reporter->id,
                    ReportSubjectType::SELLER,
                    $fixture->reported->id,
                    $fixture->reported->id,
                    ReportReason::HARASSMENT,
                    $body,
                ),
                'may not contain',
            );
            $this->assertInstanceOf(PersonalDataRefused::class, $thrown);
            $this->assertSame($category, $thrown->category);
            $this->assertFalse(
                str_contains($thrown->getMessage(), $body),
                'the refusal does not repeat the personal data it found',
            );
        }

        $this->assertCount(0, $fixture->store->all('safety_reports'));
    }
}
