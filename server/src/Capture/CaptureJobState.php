<?php

declare(strict_types=1);

namespace NasTech\Capture;

/**
 * The capture job ladder — a transcription, not an invention.
 *
 * The eight names are the ones `CaptureJobState` declares in
 * `packages/api-contracts/src/index.ts`, and the edges between them are the ones
 * `tooling/asset-pipeline/job-state.ts` declares as `TRANSITIONS`. Both are checked
 * against this file by tests/Capture/CaptureJobLadderTest.php.
 *
 * Why it is a transcription and not "our own naming for the PHP side": the same job
 * is read by the studio CLI (TypeScript), by the staff review screen, by this server,
 * and by the `capture.capture_jobs.state` CHECK in db/migrations/004_capture.sql. A
 * second vocabulary means a job that is `published` in one place is `done` in
 * another, and the only thing that notices is a dispute after the buyer has seen the
 * model. The pipeline's own header says the same thing about its copy.
 *
 * `failed` and `reshot` are reachable from the QC states only. Before QC there is
 * nothing that has been judged, and letting a job fail from `intake` would hand an
 * operator a way to end a custody trail they had barely started — which is the
 * pipeline's argument (job-state.ts, "the machine is deliberately narrow") and ours.
 */
enum CaptureJobState: string
{
    case Intake = 'intake';
    case Captured = 'captured';
    case Processed = 'processed';
    case QcAuto = 'qc_auto';
    case QcHuman = 'qc_human';
    case Published = 'published';
    case Failed = 'failed';
    case Reshot = 'reshot';

    /**
     * The linear path. Everything else in the machine is a branch off it.
     *
     * @return list<self>
     */
    public static function linearPath(): array
    {
        return [self::Intake, self::Captured, self::Processed, self::QcAuto, self::QcHuman, self::Published];
    }

    /**
     * States a job may be left in. A closed job is evidence: nothing follows it, and
     * its row is frozen by a trigger as well as by the aggregate.
     *
     * @return list<self>
     */
    public static function terminal(): array
    {
        return [self::Published, self::Failed];
    }

    public function isTerminal(): bool
    {
        return in_array($this, self::terminal(), true);
    }

    /**
     * Does this state assert a judgement? An entry that ends here must carry the
     * measurement, session directory or decision text behind it — the same list the
     * pipeline's custody log uses (custody.ts, EVIDENCE_REQUIRED_TO), and the same
     * list the DDL repeats as `judgement_entry_carries_evidence`.
     *
     * @return list<self>
     */
    public static function judgementStates(): array
    {
        return [self::QcAuto, self::QcHuman, self::Published, self::Failed, self::Reshot];
    }

    public function assertsAJudgement(): bool
    {
        return in_array($this, self::judgementStates(), true);
    }

    /**
     * Position on the linear path, for the staff progress bar.
     *
     * `failed` and `reshot` report the depth they branched from rather than pretending
     * to be steps seven and eight, because a screen that shows "6 of 6" for a failed
     * job tells the studio manager the pilot succeeded.
     *
     * @return array{step: int, of: int, label: string}
     */
    public function progress(): array
    {
        $linear = self::linearPath();
        $index = array_search($this, $linear, true);
        if ($index !== false) {
            return ['step' => $index + 1, 'of' => count($linear), 'label' => $this->value];
        }

        if ($this === self::Reshot) {
            return ['step' => 2, 'of' => count($linear), 'label' => 'reshot — back at capture'];
        }

        return ['step' => count($linear), 'of' => count($linear), 'label' => 'failed — closed'];
    }

    /**
     * @return list<string> the wire values, in ladder order
     */
    public static function vocabulary(): array
    {
        return array_map(static fn (self $s): string => $s->value, self::cases());
    }
}
