#!/usr/bin/env bun
/**
 * `nastech-capture` — the CLI the studio runs between the turntable and the bucket.
 *
 * Conventions that are load-bearing, not stylistic:
 *
 * - **state only moves when the work actually happened.** `process` does not mark a job `processed`
 *   if the geometry tools are missing; `publish` does not mark a job `published` if no bytes were
 *   uploaded. A job state is a custody claim, so a step that failed leaves the machine where it was
 *   and exits non-zero.
 * - **every transition goes through the custody log**, named by the person who ran it. `--actor` is
 *   required rather than defaulted to whoever is logged in, because an automatic actor is how a swap
 *   becomes invisible.
 * - **exit codes are the CI contract.** 0 means the step happened. Non-zero is the typed failure's
 *   own code (see `errors.ts`), so `process` failing because Blender is missing is distinguishable
 *   from failing because a measurement sheet is wrong.
 * - **a judgement that fails is still recorded.** A refused session moves through `qc_auto` and on to
 *   `reshot`/`failed` with its gate numbers in the evidence field, then exits non-zero. Refusing
 *   silently would leave the next operator with no idea that this item was already tried.
 *
 * Run: bun tooling/asset-pipeline/cli.ts <command> [flags]   (or `nastech-capture` via the package bin)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { money } from '@nastech/api-contracts';
import type { ClaimScope } from '@nastech/api-contracts';
import { captureNotViable, inputInvalid, toCaptureError, usageError } from './errors.js';
import { advance, canTransition, createJob, isKnownState, pathProgress, type CaptureJob } from './job-state.js';
import { openCustodyLog, type CustodyLog, type CustodyRecord } from './custody.js';
import {
  assessCaptureViability,
  issueReceipt,
  matchReceiptToCustody,
  renderReceiptJson,
  renderReceiptText,
  type IntakeReceipt,
} from './intake-receipt.js';
import { alignCapture, describeAlignment, type ReferenceObservation } from './metric-align.js';
import { countFrames, describeGateResult, refuseFromQc, runAutoQc, type QcMeasurements, type QcReport, type QcThresholds } from './auto-qc.js';
import { generateRenditions, planRenditions, renderPlan, type ProducedRendition } from './rendition-gen.js';
import { buildManifest, narrowerScope, scopeWidth, type CaptionDraft, type SpriteSpec } from './manifest-build.js';
import { checkPublishedAsset, formatBudgetReport, requireWithinBudget } from './budget-check.js';
import { describeUpload, resolveTransport, uploadRenditions, type UploadReceipt } from './upload.js';

export const COMMANDS = ['intake', 'capture', 'process', 'qc-auto', 'qc-human', 'publish', 'reshot', 'status'] as const;
export type Command = (typeof COMMANDS)[number];

export interface Io {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: NodeJS.ProcessEnv;
  readonly now: () => Date;
}

export function createIo(overrides: Partial<Io> = {}): Io {
  return {
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
    env: process.env,
    now: () => new Date(),
    ...overrides,
  };
}

export interface ParsedArgs {
  readonly command: Command | null;
  readonly flags: Readonly<Record<string, readonly string[]>>;
}

/** `--key value`, `--key=value` and bare `--flag`; repeats are kept in order, since `--reference` is a list. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: Record<string, string[]> = {};
  let command: Command | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) {
      if (command === null && (COMMANDS as readonly string[]).includes(token)) command = token as Command;
      else throw usageError(`"${token}" is not a command this CLI knows.`, `Commands: ${COMMANDS.join(', ')}.`);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    const name = eq >= 0 ? body.slice(0, eq) : body;
    let value = eq >= 0 ? body.slice(eq + 1) : '';
    if (eq < 0 && i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
      i += 1;
      value = argv[i]!;
    }
    flags[name] = [...(flags[name] ?? []), value];
  }
  return { command, flags };
}

function all(flags: ParsedArgs['flags'], name: string): readonly string[] {
  return (flags[name] ?? []).filter((value) => value.length > 0);
}

function flag(flags: ParsedArgs['flags'], name: string): string | null {
  const values = all(flags, name);
  return values.length === 0 ? null : values[values.length - 1]!;
}

function required(flags: ParsedArgs['flags'], name: string, command: string): string {
  const value = flag(flags, name);
  if (value === null) throw usageError(`${command} needs --${name} <value>.`, `Every custody entry names its inputs; --${name} is one of them.`);
  return value;
}

function requiredNumber(flags: ParsedArgs['flags'], name: string, command: string): number {
  const raw = required(flags, name, command);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw usageError(`--${name} must be a number, got "${raw}".`, 'Measurements are numbers, not descriptions.');
  return value;
}

function hasFlag(flags: ParsedArgs['flags'], name: string): boolean {
  return (flags[name] ?? []).length > 0;
}

function workspaceDir(flags: ParsedArgs['flags'], env: NodeJS.ProcessEnv): string {
  return resolve(flag(flags, 'workspace') ?? env.NASTECH_CAPTURE_HOME ?? '.nastech-capture');
}

const HELP = `nastech-capture — studio capture pipeline

Commands
  intake     Open a job, refuse an item that cannot recover its capture cost, print the receipt
  capture    Register a frame session against an open job (frames are counted, not declared)
  process    Solve metric alignment, then build lod0/lod1/lod2 + poster (needs gltf-transform, blender)
  qc-auto    Run the measurable gates; a refused session routes to reshot or fail, still on record
  qc-human   Record the officer's decision, and any claim-scope choice, with a named actor
  publish    Assemble the manifest, gate it on budget, upload to the private bucket
  reshot     Send a judged session back for recapture (the next session opens a new asset version)
  status     Show a job's state, gates, scope and full custody history (or list jobs)

Common flags
  --workspace <dir>   job store (default $NASTECH_CAPTURE_HOME, else ./.nastech-capture)
  --json              machine-readable output for CI
  --job <id>          required by every command except a job-less status

intake refuses below the break-even line; at that price the static path — poster, turntable,
written condition — is the right listing, not a worse one.`;

interface JobStore {
  readonly workspace: string;
  readonly custody: CustodyLog;
  readJob(jobId: string): CaptureJob;
  writeJob(job: CaptureJob): void;
  path(...parts: readonly string[]): string;
}

function openStore(workspace: string): JobStore {
  const jobsDir = join(workspace, 'jobs');
  mkdirSync(jobsDir, { recursive: true });
  const custody = openCustodyLog(join(workspace, 'custody.jsonl'));
  return {
    workspace,
    custody,
    path: (...parts: readonly string[]) => join(workspace, ...parts),
    readJob(jobId: string): CaptureJob {
      const file = join(jobsDir, `${jobId}.json`);
      if (!existsSync(file)) throw inputInvalid(`No job "${jobId}" in ${jobsDir}.`, 'Start it with `nastech-capture intake`.');
      const job = JSON.parse(readFileSync(file, 'utf8')) as CaptureJob;
      if (!isKnownState(job.state)) throw inputInvalid(`Job ${jobId} is stored in state "${job.state}", which is not a pipeline state.`, 'The job file was edited outside the CLI; restore it from the custody history.');
      return job;
    },
    writeJob(job: CaptureJob): void {
      writeFileSync(join(jobsDir, `${job.jobId}.json`), `${JSON.stringify(job, null, 2)}\n`, 'utf8');
    },
  };
}

function readJsonFile<T>(path: string, what: string): T {
  if (!existsSync(path)) {
    throw inputInvalid(`The ${what} file "${path}" does not exist.`, `Produce ${what} before this step; the pipeline will not invent the numbers it gates on.`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    throw inputInvalid(`The ${what} file "${path}" is not valid JSON.`, 'Fix the file; a half-written sheet is worse than none.');
  }
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function appendCustody(
  log: CustodyLog,
  job: CaptureJob,
  to: CaptureJob['state'],
  actor: string,
  at: string,
  evidence: string,
): CustodyRecord {
  return log.append({ jobId: job.jobId, from: job.state, to, actor, at, evidence });
}

/**
 * `--reference card=<id>,units=<n>,source=<frame>` — the physical reference measured in frame.
 * A reading that does not name the object it measured is refused: an unnamed reference produces a
 * scale nobody can re-check at the dispute stage.
 */
export function parseReferences(values: readonly string[]): ReferenceObservation[] {
  if (values.length === 0) {
    throw usageError('No --reference reading was given.', 'Pass at least one: --reference card=credit_card,units=12.4,source=frame_010');
  }
  return values.map((raw) => {
    const parts: Record<string, string> = {};
    for (const pair of raw.split(',')) {
      const eq = pair.indexOf('=');
      if (eq > 0) parts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
    const cardId = parts['card'];
    const units = Number(parts['units']);
    if (!cardId) throw usageError(`Reference "${raw}" does not name a card=<id>.`, 'Name the physical object that is actually in frame.');
    if (!Number.isFinite(units) || units <= 0) throw usageError(`Reference "${raw}" has no usable units=<n>.`, 'units is the reference width in the reconstruction: a positive number.');
    return { cardId, measuredUnits: units, source: parts['source'] ?? 'unspecified frame' };
  });
}

function receiptFor(store: JobStore, job: CaptureJob): IntakeReceipt | null {
  if (job.receiptCode === null) return null;
  const file = store.path('receipts', `${job.receiptCode}.json`);
  return existsSync(file) ? readJsonFile<IntakeReceipt>(file, 'receipt') : null;
}

function qcReportPath(store: JobStore, jobId: string): string {
  return store.path('qc', `${jobId}.report.json`);
}

function producedPath(store: JobStore, jobId: string): string {
  return store.path('produced', `${jobId}.json`);
}

interface CommandResult {
  readonly human: string;
  readonly json: unknown;
}

function runIntake(args: ParsedArgs, io: Io): CommandResult {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = required(args.flags, 'job', 'intake');
  const itemId = required(args.flags, 'item', 'intake');
  const title = required(args.flags, 'title', 'intake');
  const actor = required(args.flags, 'actor', 'intake');
  const studio = required(args.flags, 'studio', 'intake');
  const price = money(Math.round(requiredNumber(args.flags, 'price-cents', 'intake')));

  // Everything the receipt will refuse is checked before the custody log is touched. Otherwise a
  // whitespace-only title would leave an intake row with no job and no receipt, and a re-run would
  // be refused for reusing a job id whose history exists precisely because the first run failed.
  for (const [label, value] of [
    ['job id', jobId],
    ['item id', itemId],
    ['title', title],
    ['actor', actor],
    ['studio', studio],
  ] as const) {
    if (!value.trim()) throw inputInvalid(`intake needs a non-empty ${label}.`, 'A receipt that cannot identify the item or the taker is not custody evidence.');
  }

  if (existsSync(join(store.workspace, 'jobs', `${jobId}.json`))) {
    throw inputInvalid(`Job "${jobId}" already exists.`, 'A job id is a custody key; reusing one merges two items into one history.');
  }
  if (store.custody.records(jobId).length > 0) throw inputInvalid(`Custody history already exists for job "${jobId}".`, 'Use a fresh job id.');

  // The economic gate runs before anything is written: printing a receipt for an item that should
  // never have been captured puts a promise on paper that the studio cannot keep.
  const viability = assessCaptureViability(price);
  if (!viability.viable) throw captureNotViable(viability.priceCents, viability.breakEvenCents, viability.captureCostCents, viability.takeRate);

  const at = io.now().toISOString();
  const listingId = flag(args.flags, 'listing');
  const genesis = store.custody.append({
    jobId,
    from: null,
    to: 'intake',
    actor,
    at,
    evidence: `item=${itemId};price=${price.cents};title=${title}`,
  });

  const receipt = issueReceipt({
    jobId,
    itemId,
    listingId,
    title,
    price,
    takenBy: actor,
    studio,
    at,
    custodyStartHash: genesis.hash,
    conditionNotes: all(args.flags, 'note'),
  });

  store.writeJob(createJob({ jobId, itemId, listingId, title, price, actor, receiptCode: receipt.code, assetId: flag(args.flags, 'asset'), now: at }));
  writeJsonFile(store.path('receipts', `${receipt.code}.json`), receipt);

  return {
    human: `${renderReceiptText(receipt)}\n\n${viability.reason}`,
    json: { receipt: JSON.parse(renderReceiptJson(receipt)), custody: genesis, viability },
  };
}

function runCapture(args: ParsedArgs, io: Io): CommandResult {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = required(args.flags, 'job', 'capture');
  const actor = required(args.flags, 'actor', 'capture');
  const session = resolve(required(args.flags, 'session', 'capture'));
  const job = store.readJob(jobId);

  // The directory is the authority. `--frames` is accepted only so a station that also sealed a
  // manifest can prove the two counts agree; a declared number that disagrees with the disk is a
  // session in the middle of copying, not a capture.
  const counted = countFrames(session);
  const declared = flag(args.flags, 'frames');
  if (declared !== null && Number(declared) !== counted) {
    throw inputInvalid(
      `--frames says ${declared}, but ${session} holds ${counted} image frames.`,
      'Finish copying the session, or omit --frames and let the pipeline count it.',
      { declared, counted, session },
    );
  }
  const frames = counted;

  const verdict = canTransition(job.state, 'captured');
  if (!verdict.ok) throw inputInvalid(`Cannot register a session on job ${jobId}: ${verdict.reason}`, 'Run `status --job <id>` — a captured job already holds a session.');

  const at = io.now().toISOString();
  const next = advance(job, 'captured', at);
  const record = appendCustody(store.custody, job, 'captured', actor, at, `session=${session};frames=${frames}`);
  store.writeJob({ ...next, sessionDir: session, frameCount: frames });
  const progress = pathProgress('captured');
  return {
    human: `Job ${jobId}: ${frames} frames registered from ${session}.\nState ${next.state} (${progress.step}/${progress.of}). Custody entry #${record.sequence}.`,
    json: { jobId, frames, sessionDir: session, state: next.state, custody: record },
  };
}

function runProcess(args: ParsedArgs, io: Io): CommandResult {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = required(args.flags, 'job', 'process');
  const actor = required(args.flags, 'actor', 'process');
  const source = resolve(required(args.flags, 'source', 'process'));
  const job = store.readJob(jobId);
  const assetId = job.assetId ?? `ast_${job.itemId.replace(/[^A-Za-z0-9_-]/g, '') || 'unnumbered'}`;
  const outDir = resolve(flag(args.flags, 'out') ?? store.path('renditions', jobId, `v${job.assetVersion}`));

  // Alignment first: a session that cannot be scaled honestly should not spend geometry compute, let
  // alone produce a model whose size claim is wrong.
  const alignment = alignCapture({
    observations: parseReferences(all(args.flags, 'reference')),
    caseSpanUnits: requiredNumber(args.flags, 'case-span-units', 'process'),
  });

  const genInput = { sourceFile: source, assetId, assetVersion: job.assetVersion, outDir };
  io.stdout(renderPlan(planRenditions(genInput, 'lod0/lod1/lod2 and the poster are built by gltf-transform and blender.')));

  // Absent tools throw out of here, before the job moves: the state would otherwise claim geometry
  // that does not exist.
  const produced = generateRenditions(genInput, { env: io.env });

  const at = io.now().toISOString();
  const next = advance(job, 'processed', at);
  const record = appendCustody(
    store.custody,
    job,
    'processed',
    actor,
    at,
    `${describeAlignment(alignment)};renditions=${produced.map((p) => `${p.lod}=${p.bytes}B`).join(',')}`,
  );
  store.writeJob({ ...next, assetId, metricScaleMetersPerUnit: alignment.metersPerUnit, caseDiameterMm: alignment.caseDiameterMm });
  writeJsonFile(producedPath(store, jobId), { assetId, version: job.assetVersion, produced });

  return {
    human: `Job ${jobId}: ${produced.length} renditions produced.\n${describeAlignment(alignment)}\nState ${next.state}. Custody entry #${record.sequence}.`,
    json: { jobId, assetId, alignment, produced, state: next.state, custody: record },
  };
}

function runQcAuto(args: ParsedArgs, io: Io): CommandResult {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = required(args.flags, 'job', 'qc-auto');
  const actor = required(args.flags, 'actor', 'qc-auto');
  const job = store.readJob(jobId);

  const measuresFile = resolve(flag(args.flags, 'measures') ?? store.path('qc', `${jobId}.measures.json`));
  const measures = readJsonFile<QcMeasurements>(measuresFile, 'QC measurement sheet');
  const thresholdsFile = flag(args.flags, 'thresholds');
  const thresholds = thresholdsFile === null ? undefined : readJsonFile<QcThresholds>(resolve(thresholdsFile), 'threshold override');

  // Coverage is taken from the session on disk rather than from the sheet: it is the one gate nobody
  // has to take on trust.
  const frameCount = job.sessionDir === null ? measures.frameCount : countFrames(job.sessionDir);
  const aligned = job.metricScaleMetersPerUnit !== null;
  const report = runAutoQc(
    { ...measures, frameCount },
    { ...(thresholds ? { thresholds } : {}), aligned, measuredAt: io.now().toISOString() },
  );
  writeJsonFile(qcReportPath(store, jobId), report);
  const gateLines = report.results.map(describeGateResult).join('\n');

  const at = io.now().toISOString();
  const judged = advance(job, 'qc_auto', at);
  const gateBrief = report.results.map((r) => `${r.id}=${r.measured}${r.pass ? '' : '(FAIL)'}`).join(';');
  const judgement = appendCustody(
    store.custody,
    job,
    'qc_auto',
    actor,
    at,
    `verdict=${report.verdict};${gateBrief};scope_supported=${report.scopeSupported};report=${qcReportPath(store, jobId)}`,
  );
  // The verdict and the supported scope are carried on the job itself, so a later refusal that routes
  // the session on cannot drop them: the judgement has to survive in the record the officer reads.
  const recorded: CaptureJob = { ...judged, autoQcVerdict: report.verdict === 'pass' ? 'pass' : 'fail', scopeSupported: report.scopeSupported };
  store.writeJob(recorded);

  if (report.verdict === 'pass') {
    return {
      human: `Job ${jobId} auto-QC PASSED. The evidence supports claim scope "${report.scopeSupported}".\n${gateLines}\nState ${recorded.state}. Custody entry #${judgement.sequence}.`,
      json: { jobId, verdict: report.verdict, scopeSupported: report.scopeSupported, report, state: recorded.state, custody: judgement },
    };
  }

  // The refusal is recorded before it is raised, so a failed session is visible in the history
  // rather than being something the next operator redoes blind.
  const routeRaw = flag(args.flags, 'on-fail') ?? 'reshot';
  if (routeRaw !== 'reshot' && routeRaw !== 'failed') {
    throw usageError(`--on-fail must be reshot or fail, got "${routeRaw}".`, 'Those are the two things a refused session can become.');
  }
  const route = routeRaw;
  const routed = advance(recorded, route, at);
  const routing = appendCustody(store.custody, recorded, route, actor, at, `qc_auto_refused:${gateBrief};report=${qcReportPath(store, jobId)}`);
  store.writeJob(routed);
  io.stderr(gateLines);
  // Throws with the gate numbers and a non-zero exit: everything above is already on the record.
  refuseFromQc(report);
}

function runQcHuman(args: ParsedArgs, io: Io): CommandResult {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = required(args.flags, 'job', 'qc-human');
  const actor = required(args.flags, 'actor', 'qc-human');
  const decision = required(args.flags, 'decision', 'qc-human') as 'pass' | 'reshot' | 'fail';
  if (decision !== 'pass' && decision !== 'reshot' && decision !== 'fail') {
    throw usageError(`--decision must be pass, reshot or fail, got "${decision}".`, 'The officer decides; anything else is not a decision.');
  }
  const reason = required(args.flags, 'reason', 'qc-human');
  const job = store.readJob(jobId);
  const requested = flag(args.flags, 'claim-scope') as ClaimScope | null;

  if (requested !== null) {
    if (requested !== 'none' && requested !== 'condition_only' && requested !== 'geometry_and_external_condition') {
      throw inputInvalid(`"${requested}" is not a claim scope.`, 'Use one of the three scopes the contract defines.');
    }
    const supported = job.scopeSupported;
    if (supported === null) throw inputInvalid(`Job ${jobId} has no auto-QC result, so there is nothing to judge a claim against.`, 'Run qc-auto first.');
    // Asked at the decision, not at the manifest: an officer who cannot widen a claim should hear so
    // now, not after the whole asset has been assembled.
    else if (scopeWidth(requested) > scopeWidth(supported)) {
      throw inputInvalid(
        `Cannot claim "${requested}": the QC evidence on this job supports "${supported}".`,
        'Re-shoot until the missing gates pass. Scope is decided by evidence, not by preference.',
        { requested, supported },
      );
    }
  }

  const to: CaptureJob['state'] = decision === 'pass' ? 'qc_human' : decision === 'reshot' ? 'reshot' : 'failed';
  const at = io.now().toISOString();
  const next = advance(job, to, at);
  const record = appendCustody(
    store.custody,
    job,
    to,
    actor,
    at,
    `human_decision=${decision};reason=${reason}${requested === null ? '' : `;claim_scope_asked=${requested}`}`,
  );
  store.writeJob({
    ...next,
    humanDecision: decision,
    ...(requested === null
      ? {}
      : {
          scopeGranted: narrowerScope(job.scopeSupported ?? 'none', requested),
          scopeDecisionActor: actor,
          scopeDecisionCustodySeq: record.sequence,
        }),
  });
  return {
    human: `Job ${jobId}: officer ${actor} recorded "${decision}". Reason on record: ${reason}\nState ${next.state}. Custody entry #${record.sequence}.`,
    json: { jobId, decision, reason, actor, state: next.state, scopeGranted: next.scopeGranted, custody: record },
  };
}

interface ProducedRecord {
  readonly assetId: string;
  readonly version: number;
  readonly produced: readonly ProducedRendition[];
}

async function runPublish(args: ParsedArgs, io: Io): Promise<CommandResult> {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = required(args.flags, 'job', 'publish');
  const actor = required(args.flags, 'actor', 'publish');
  const job = store.readJob(jobId);
  if (job.state !== 'qc_human') {
    throw inputInvalid(
      `Job ${jobId} is in "${job.state}"; only a job an officer passed can be published.`,
      'A model that skipped human QC has no recorded judgement behind its claim scope.',
    );
  }
  if (job.autoQcVerdict !== 'pass') throw inputInvalid(`Job ${jobId} has no passing auto-QC record.`, 'Publish would attach a claim scope to a session the gates refused.');

  const produced = readJsonFile<ProducedRecord>(producedPath(store, jobId), 'produced-rendition');
  const models = produced.produced.filter((p) => p.kind === 'MODEL');
  const poster = produced.produced.find((p) => p.kind === 'POSTER');
  if (!poster) throw inputInvalid('No poster was produced for this job.', 'Without the poster the listing has nothing to show a buyer who has no WebGL.');

  const captions = readJsonFile<readonly CaptionDraft[]>(
    resolve(flag(args.flags, 'captions') ?? store.path('captions', `${jobId}.json`)),
    'captions',
  );

  const spriteFile = flag(args.flags, 'sprite-file');
  let sprite: SpriteSpec | undefined;
  if (spriteFile !== null) {
    const path = resolve(spriteFile);
    const frames = requiredNumber(args.flags, 'sprite-frames', 'publish');
    if (!Number.isInteger(frames) || frames <= 0) throw inputInvalid(`--sprite-frames ${frames} is not a whole frame count.`, 'Count the turntable frames you actually baked.');
    const size = required(args.flags, 'sprite-px', 'publish');
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (!match) throw usageError(`--sprite-px must look like 3072x256, got "${size}".`, 'The strip is one image; its pixel size is declared, not guessed.');
    sprite = {
      id: `ren_${produced.assetId}_v${produced.version}_sprite`,
      kind: 'SPRITE',
      path,
      bytes: readFileSync(path).length,
      sha256: hashFile(path),
      frames,
      widthPx: Number(match[1]),
      heightPx: Number(match[2]),
    };
  }

  const report = readJsonFile<QcReport>(qcReportPath(store, jobId), 'auto-QC report');
  const humanWiden =
    job.scopeGranted !== null && job.scopeDecisionActor !== null && job.scopeDecisionCustodySeq !== null
      ? { to: job.scopeGranted, actor: job.scopeDecisionActor, custodyRef: `custody.jsonl#${job.jobId}#${job.scopeDecisionCustodySeq}` }
      : undefined;

  const manifest = buildManifest({
    assetId: produced.assetId,
    listingId: job.listingId ?? job.itemId,
    version: produced.version,
    models,
    poster,
    ...(sprite ? { sprite } : {}),
    metricScaleMetersPerUnit: job.metricScaleMetersPerUnit ?? Number.NaN,
    qc: report,
    captions,
    ...(humanWiden ? { humanWiden } : {}),
  });

  const budget = checkPublishedAsset(manifest);
  requireWithinBudget(budget);
  const manifestPath = store.path('manifests', `${manifest.assetId}.v${manifest.version}.json`);
  writeJsonFile(manifestPath, manifest);
  io.stdout(formatBudgetReport(budget));

  if (hasFlag(args.flags, 'check-only')) {
    return {
      human: `Job ${jobId}: manifest validated and written to ${manifestPath}.\nNO BYTES WERE UPLOADED AND THE JOB REMAINS "${job.state}" — this is not a published asset.`,
      json: { jobId, manifest, budget, uploaded: false, checkOnly: true, state: job.state },
    };
  }

  const transport = resolveTransport(io.env);
  const localPathOf = (renditionIdValue: string): string => {
    const match = produced.produced.find((p) => p.id === renditionIdValue);
    if (match) return match.path;
    if (sprite && sprite.id === renditionIdValue) return sprite.path;
    throw inputInvalid(`Rendition ${renditionIdValue} has no local file.`, 'The manifest lists something that was never produced; re-run process.');
  };
  const receipts = await uploadRenditions(
    manifest.renditions.map((rendition) => ({ rendition, localPath: localPathOf(rendition.id) })),
    transport,
  );

  const at = io.now().toISOString();
  const next = advance(job, 'published', at);
  const record = appendCustody(
    store.custody,
    job,
    'published',
    actor,
    at,
    `asset=${manifest.assetId};version=${manifest.version};scope=${manifest.claimScope};checksum=${manifest.checksum.slice(0, 19)};transport=${transport.name};manifest=${manifestPath}`,
  );
  store.writeJob(next);
  return {
    human: `Job ${jobId} published.\n${describeUpload(receipts)}\nClaim scope: ${manifest.claimScope}\nManifest ${manifestPath}. Custody entry #${record.sequence}.`,
    json: { jobId, manifest, budget, receipts, state: next.state, custody: record },
  };
}

function runReshot(args: ParsedArgs, io: Io): CommandResult {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = required(args.flags, 'job', 'reshot');
  const actor = required(args.flags, 'actor', 'reshot');
  const reason = required(args.flags, 'reason', 'reshot');
  const job = store.readJob(jobId);
  const at = io.now().toISOString();
  const next = advance(job, 'reshot', at);
  const record = appendCustody(
    store.custody,
    job,
    'reshot',
    actor,
    at,
    `reshot_reason=${reason};previous_scope_supported=${job.scopeSupported ?? 'unjudged'};abandoned_version=${job.assetVersion}`,
  );
  store.writeJob({ ...next, autoQcVerdict: null, scopeGranted: null, scopeDecisionActor: null, scopeDecisionCustodySeq: null, sessionDir: null, frameCount: null });
  return {
    human: `Job ${jobId} sent back for a re-shoot. Reason on record: ${reason}\nThe next captured session opens asset version ${job.assetVersion + 1}; the attempt before it stays in the history.\nState ${next.state}. Custody entry #${record.sequence}.`,
    json: { jobId, reason, actor, nextVersion: job.assetVersion + 1, state: next.state, custody: record },
  };
}

function runStatus(args: ParsedArgs, io: Io): CommandResult {
  const store = openStore(workspaceDir(args.flags, io.env));
  const jobId = flag(args.flags, 'job');
  if (jobId === null) {
    const dir = join(store.workspace, 'jobs');
    const ids = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
    const rows = ids.map((id) => {
      const job = store.readJob(id);
      const progress = pathProgress(job.state);
      return `${id.padEnd(16)} ${job.state.padEnd(10)} ${`${progress.step}/${progress.of}`.padEnd(6)} ${job.itemId.padEnd(14)} ${job.title}`;
    });
    return {
      human: rows.length === 0 ? `No jobs in ${dir}.` : `JOB              STATE      STEP  ITEM           TITLE\n${rows.join('\n')}`,
      json: { workspace: store.workspace, jobs: ids.map((id) => store.readJob(id)) },
    };
  }

  const job = store.readJob(jobId);
  const history = store.custody.records(job.jobId);
  const chain = store.custody.verify();
  const receipt = receiptFor(store, job);
  const custodyMatch = receipt === null ? null : matchReceiptToCustody(receipt, store.custody);
  const gatesFile = qcReportPath(store, job.jobId);
  const gateLines = existsSync(gatesFile)
    ? (() => {
        const report = readJsonFile<QcReport>(gatesFile, 'auto-QC report');
        return `${report.results.map((r) => `  ${describeGateResult(r)}`).join('\n')}\n  verdict ${report.verdict}, evidence supports scope "${report.scopeSupported}"`;
      })()
    : '  no auto-QC run';

  const progress = pathProgress(job.state);
  const lines = [
    `job        ${job.jobId}  (updated ${job.updatedAt})`,
    `state      ${job.state}  step ${progress.step}/${progress.of}`,
    `item       ${job.itemId} — ${job.title}`,
    `listing    ${job.listingId ?? 'not linked'}`,
    `price      R${(job.price.cents / 100).toFixed(2)} ${job.price.currency}`,
    `asset      ${job.assetId ?? 'not assigned'} v${job.assetVersion}`,
    `session    ${job.sessionDir ?? 'none'}  frames ${job.frameCount ?? '—'}`,
    `scale      ${job.metricScaleMetersPerUnit ?? '—'} m/unit  case ${job.caseDiameterMm === null ? '—' : `${job.caseDiameterMm.toFixed(1)} mm`}`,
    `scope      supported ${job.scopeSupported ?? '—'} / granted ${job.scopeGranted ?? '—'}`,
    `receipt    ${job.receiptCode ?? 'none'}`,
    `custody    ${chain.ok ? 'VERIFIED' : `BROKEN at entry ${chain.sequence}: ${chain.reason}`}  (${history.length} entries)`,
    `paper trail ${custodyMatch === null ? 'no receipt to match' : custodyMatch.ok ? `MATCHES — custody opened ${custodyMatch.startedAt} by ${custodyMatch.actor}` : `DOES NOT MATCH — ${custodyMatch.reason}`}`,
    'history',
    ...history.map((r) => `  #${String(r.sequence).padStart(3, '0')} ${`${r.from ?? '∅'}→${r.to}`.padEnd(21)} ${r.at}  ${r.actor}  ${r.evidence ?? ''}`),
    'gates',
    gateLines,
  ];
  return { human: lines.join('\n'), json: { job, history, chain, receipt, custodyMatch } };
}

type Handler = (args: ParsedArgs, io: Io) => CommandResult | Promise<CommandResult>;

const HANDLERS: Readonly<Record<Command, Handler>> = {
  intake: runIntake,
  capture: runCapture,
  process: runProcess,
  'qc-auto': runQcAuto,
  'qc-human': runQcHuman,
  publish: runPublish,
  reshot: runReshot,
  status: runStatus,
};

/** The whole CLI as a function, so a test can assert the exit code instead of scraping a terminal. */
export async function runCli(argv: readonly string[], io: Io = createIo()): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (cause) {
    const error = toCaptureError(cause);
    io.stderr(`${error.operatorSentence}\n→ ${error.hint}`);
    return error.exitCode;
  }

  if (hasFlag(args.flags, 'help')) {
    io.stdout(HELP);
    return 0;
  }
  if (args.command === null) {
    io.stderr(HELP);
    return 2;
  }

  const asJson = hasFlag(args.flags, 'json');
  try {
    const result = await HANDLERS[args.command](args, io);
    if (asJson) {
      io.stdout(JSON.stringify({ command: args.command, ok: true, result: result.json }, null, 2));
    } else {
      io.stdout(result.human);
    }
    return 0;
  } catch (cause) {
    const error = toCaptureError(cause);
    if (asJson) io.stdout(JSON.stringify({ command: args.command, ok: false, error: error.toJSON() }, null, 2));
    else {
      io.stderr(`REFUSED (${error.code}, exit ${error.exitCode}): ${error.operatorSentence}`);
      io.stderr(`→ ${error.hint}`);
    }
    return error.exitCode;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
