import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CaptureJobState, ClaimScope } from '@nastech/api-contracts';
import { COMMANDS, parseArgs, parseReferences, runCli, type Io } from '../cli.js';
import type { CaptureJob } from '../job-state.js';
import type { CaptionDraft } from '../manifest-build.js';
import type { QcMeasurements } from '../auto-qc.js';

const CLI_PATH = join(import.meta.dir, '..', 'cli.ts');

/** `bun` is needed on the child PATH so a fake tool's `#!/usr/bin/env bun` shebang resolves. */
const RUNTIME_PATH = `${dirname(process.execPath)}:${process.env.PATH ?? ''}`;

/** A spawned CLI needs HOME for bun's transpile cache; everything else each test controls itself. */
const SPAWN_ENV = { PATH: RUNTIME_PATH, HOME: process.env.HOME ?? '/tmp' };

interface Harness {
  readonly root: string;
  readonly workspace: string;
  readonly bin: string;
  readonly session: string;
  readonly out: string[];
  readonly err: string[];
  env(): NodeJS.ProcessEnv;
  io(overrides?: Partial<Io>): Io;
  args(...argv: readonly string[]): string[];
  run(argv: readonly string[], overrides?: Partial<Io>): Promise<{ code: number; out: string; err: string }>;
  job(): CaptureJob;
  custodyLines(): string[];
  read(path: string): string;
  has(path: string): boolean;
  write(path: string, body: string): void;
  cleanup(): void;
}

function makeHarness(): Harness {
  const root = mkdtempSync(join(tmpdir(), 'nastech-cli-'));
  const workspace = join(root, 'store');
  const bin = join(root, 'bin');
  const session = join(root, 'frames');
  mkdirSync(bin, { recursive: true });
  mkdirSync(session, { recursive: true });
  const out: string[] = [];
  const err: string[] = [];
  const harness: Harness = {
    root,
    workspace,
    bin,
    session,
    out,
    err,
    env: () => ({ PATH: `${bin}:${RUNTIME_PATH}` }),
    io(overrides = {}) {
      return {
        stdout: (text) => out.push(text),
        stderr: (text) => err.push(text),
        env: harness.env(),
        now: () => new Date(),
        ...overrides,
      };
    },
    args: (...argv) => [...argv, '--workspace', workspace],
    async run(argv, overrides = {}) {
      out.length = 0;
      err.length = 0;
      const code = await runCli(harness.args(...argv), harness.io(overrides));
      return { code, out: out.join('\n'), err: err.join('\n') };
    },
    job: () => JSON.parse(readFileSync(join(workspace, 'jobs', 'job_01.json'), 'utf8')) as CaptureJob,
    custodyLines: () => readFileSync(join(workspace, 'custody.jsonl'), 'utf8').split('\n').filter((line) => line.length > 0),
    read: (path: string) => readFileSync(join(workspace, path), 'utf8'),
    has: (path: string) => existsSync(join(workspace, path)),
    write(path: string, body: string) {
      const full = join(workspace, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body, 'utf8');
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
  return harness;
}

/** A frame session the pipeline can count, with enough frames for the coverage gate. */
function writeFrames(where: string, count: number): void {
  for (let i = 1; i <= count; i += 1) {
    writeFileSync(join(where, `frame_${String(i).padStart(3, '0')}.jpg`), `frame ${i}`, 'utf8');
  }
  // a stray non-image file must not count as a frame
  writeFileSync(join(where, 'notes.txt'), 'lighting notes', 'utf8');
}

function installFakeTools(bin: string, mode: 'produce' | 'silent' | 'fail' = 'produce'): void {
  const gltf =
    mode === 'fail'
      ? '#!/usr/bin/env bash\necho "kdtree collapse on the bezel" >&2\nexit 7\n'
      : mode === 'silent'
        ? '#!/usr/bin/env bash\nexit 0\n'
        : '#!/usr/bin/env bash\nset -euo pipefail\n[ -f "$2" ] || { echo "no source" >&2; exit 3; }\nprintf \'glb %s\' "$3" > "$3"\n';
  const blender =
    mode === 'fail'
      ? '#!/usr/bin/env bash\necho "no blend file" >&2\nexit 9\n'
      : mode === 'silent'
        ? '#!/usr/bin/env bash\nexit 0\n'
        : '#!/usr/bin/env bash\nset -euo pipefail\nout=""\nwhile [ $# -gt 0 ]; do if [ "$1" = "--render-output" ]; then out="$2"; fi; shift; done\nif [ -z "$out" ]; then echo "no output" >&2; exit 3; fi\nprintf \'jpeg poster bytes\' > "$out"\n';
  for (const [name, body] of [
    ['gltf-transform', gltf],
    ['blender', blender],
  ] as const) {
    const file = join(bin, name);
    writeFileSync(file, body, 'utf8');
    chmodSync(file, 0o755);
  }
}

/**
 * A stand-in for the private bucket. It answers only the two s3api verbs the pipeline constructs,
 * logs every call it receives, and reports the stored object's real length and SHA-256 so the
 * upload path's after-put verification has something genuine to check against.
 */
function installFakeAws(bin: string, store: string): void {
  const body = `#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const store = process.env.FAKE_AWS_STORE;
if (!store) { console.error('FAKE_AWS_STORE unset'); process.exit(2); }
mkdirSync(store, { recursive: true });
const argv = process.argv.slice(2);
appendFileSync(store + '/calls.log', argv.join(' ') + '\\n');
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
if (argv[0] === '--version') { console.log('fake aws-cli/2'); process.exit(0); }
const key = flag('--key');
const file = store + '/' + createHash('sha256').update(key ?? '').digest('hex');
if (argv[1] === 'head-object') {
  if (!existsSync(file)) { console.error('An error occurred (404) when calling the HeadObject operation: Not Found'); process.exit(1); }
  const bytes = readFileSync(file);
  console.log(JSON.stringify({ ContentLength: bytes.length, ChecksumSHA256: createHash('sha256').update(bytes).digest('base64') }));
  process.exit(0);
}
if (argv[1] === 'put-object') {
  const src = flag('--body');
  if (!src || !existsSync(src)) { console.error('no body'); process.exit(1); }
  copyFileSync(src, file);
  console.log(JSON.stringify({ ETag: '"fake"' }));
  process.exit(0);
}
console.error('fake aws: refusing unsupported call ' + argv.join(' '));
process.exit(2);
`;
  const file = join(bin, 'aws');
  writeFileSync(file, body, 'utf8');
  chmodSync(file, 0o755);
}

const GOOD_MEASURES: QcMeasurements = {
  frameCount: 48,
  sharpnessScore: 0.61,
  exposureMean: 0.52,
  highlightClipFraction: 0.004,
  holeCount: 0,
  nonManifoldCount: 1,
  textureBleedRatio: 0.002,
  silhouetteIou: 0.96,
};

const CAPTIONS: readonly CaptionDraft[] = [
  {
    hotspotId: 'hs_bezel',
    position: [0.019, 0.004, 0],
    disclosureText: 'One hairline at 2 o’clock on the bezel, visible under raking light only.',
    severity: 'cosmetic',
    disclosureId: 'dis_001',
  },
];

const CREDENTIAL_ENV = {
  NASTECH_MEDIA_BUCKET_ENDPOINT: 'https://s3.af-south-1.example',
  NASTECH_MEDIA_BUCKET: 'nastech-capture-private',
  NASTECH_MEDIA_BUCKET_REGION: 'af-south-1',
  NASTECH_MEDIA_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  NASTECH_MEDIA_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

const PROCESS_ARGS = [
  'process',
  '--job', 'job_01',
  '--actor', 'baker_lika',
  '--source', 'source.glb',
  '--reference', 'card=credit_card,units=12.4,source=frame_010',
  '--reference', 'card=credit_card,units=12.41,source=frame_032',
  '--case-span-units', '5.79',
] as const;

/** intake → capture → process, using fake tools so "processed" means bytes really landed. */
async function throughProcess(h: Harness, tools: 'produce' | 'silent' | 'fail' = 'produce'): Promise<{ code: number; out: string; err: string }> {
  installFakeTools(h.bin, tools);
  const intake = await h.run(['intake', '--job', 'job_01', '--item', 'itm_seiko', '--title', 'Seiko 6309 diver', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '420000', '--note', 'light scratch on clasp']);
  if (intake.code !== 0) throw new Error(`intake failed: ${intake.err}`);
  writeFrames(h.session, 48);
  const capture = await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session]);
  if (capture.code !== 0) throw new Error(`capture failed: ${capture.err}`);
  h.write('source.glb', 'reconstruction mesh');
  return h.run(PROCESS_ARGS.map((a) => (a === 'source.glb' ? join(h.workspace, 'source.glb') : a)));
}

async function throughPublishableQc(h: Harness): Promise<void> {
  const processed = await throughProcess(h);
  if (processed.code !== 0) throw new Error(`process failed: ${processed.err}`);
  h.write('qc/job_01.measures.json', JSON.stringify(GOOD_MEASURES));
  const auto = await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally']);
  if (auto.code !== 0) throw new Error(`qc-auto failed: ${auto.err}`);
  const human = await h.run(['qc-human', '--job', 'job_01', '--actor', 'officer_thandi', '--decision', 'pass', '--reason', 'caseback photographed, no reseal evidence']);
  if (human.code !== 0) throw new Error(`qc-human failed: ${human.err}`);
  h.write('captions/job_01.json', JSON.stringify(CAPTIONS));
}

describe('argument parsing', () => {
  test('every command in the table is reachable and unknown words are refused', () => {
    expect(parseArgs(['status']).command).toBe('status');
    expect(parseArgs(['qc-auto', '--job', 'job_01']).command).toBe('qc-auto');
    expect(parseArgs(['--job', 'job_01']).command).toBeNull();
    expect(() => parseArgs(['wreck'])).toThrow();
    expect(parseArgs(['publish', '--json', '--check-only']).flags['json']).toEqual(['']);
  });

  test('a reference reading that does not name the object it measured is refused', () => {
    expect(parseReferences(['card=credit_card,units=12.4,source=frame_010'])[0]).toEqual({
      cardId: 'credit_card',
      measuredUnits: 12.4,
      source: 'frame_010',
    });
    expect(() => parseReferences([])).toThrow();
    expect(() => parseReferences(['units=12.4,source=frame_010'])).toThrow();
    expect(() => parseReferences(['card=credit_card,units=zero'])).toThrow();
  });

  test('--help prints the usage and exits 0; an absent command exits 2', async () => {
    const h = makeHarness();
    try {
      const help = await h.run(['--help']);
      expect(help.code).toBe(0);
      expect(help.out).toInclude('nastech-capture');
      const bare = await h.run([]);
      expect(bare.code).toBe(2);
      expect(bare.err).toInclude('static path');
    } finally {
      h.cleanup();
    }
  });
});

describe('intake', () => {
  test('a viable item opens a job, a custody genesis entry and a printable receipt', async () => {
    const h = makeHarness();
    try {
      const result = await h.run(['intake', '--job', 'job_01', '--item', 'itm_seiko', '--title', 'Seiko 6309 diver', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '420000', '--note', 'light scratch on clasp']);
      expect(result.code).toBe(0);
      expect(result.out).toInclude('NAS-');
      expect(result.out).toInclude('R4,200.00');
      expect(h.job().state).toBe('intake');
      const lines = h.custodyLines();
      expect(lines.length).toBe(1);
      expect(lines[0]).toInclude('"to_state":"intake"');
      expect(h.has('receipts')).toBe(true);
    } finally {
      h.cleanup();
    }
  });

  test('an item that cannot recover its capture cost is refused before anything is written', async () => {
    const h = makeHarness();
    try {
      const result = await h.run(['intake', '--job', 'job_01', '--item', 'itm_casio', '--title', 'Casio F-91W', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '45000']);
      expect(result.code).toBe(10);
      expect(result.err).toInclude('capture_not_viable');
      expect(result.err).toInclude('R2,700.00');
      expect(result.err).toInclude('static path');
      expect(h.has('jobs/job_01.json')).toBe(false);
      expect(h.has('custody.jsonl')).toBe(false);
      expect(h.has('receipts')).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  test('--json reports the refusal as a machine-readable failure with the same exit code', async () => {
    const h = makeHarness();
    try {
      const result = await h.run(['intake', '--job', 'job_01', '--item', 'itm_casio', '--title', 'Casio', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '45000', '--json']);
      expect(result.code).toBe(10);
      const parsed = JSON.parse(result.out) as { ok: boolean; error: { code: string; exitCode: number; context: Record<string, number> } };
      expect(parsed.ok).toBe(false);
      expect(parsed.error.code).toBe('capture_not_viable');
      expect(parsed.error.exitCode).toBe(10);
      expect(parsed.error.context.breakEvenCents).toBe(270000);
    } finally {
      h.cleanup();
    }
  });

  test('a job id is a custody key and cannot be reused', async () => {
    const h = makeHarness();
    try {
      const first = await h.run(['intake', '--job', 'job_01', '--item', 'itm_seiko', '--title', 'Seiko', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '420000']);
      expect(first.code).toBe(0);
      const again = await h.run(['intake', '--job', 'job_01', '--item', 'itm_other', '--title', 'Other', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '920000']);
      expect(again.code).toBe(2);
      expect(again.err).toInclude('already exists');
      expect(h.custodyLines().length).toBe(1);
    } finally {
      h.cleanup();
    }
  });
});

describe('capture', () => {
  test('frames are counted from the session directory, not declared by the operator', async () => {
    const h = makeHarness();
    try {
      await h.run(['intake', '--job', 'job_01', '--item', 'itm_seiko', '--title', 'Seiko', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '420000']);
      writeFrames(h.session, 48);
      const result = await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session]);
      expect(result.code).toBe(0);
      expect(result.out).toInclude('48 frames');
      expect(h.job().frameCount).toBe(48);
      expect(h.job().state).toBe('captured');
      // a session nobody photographed into is not a capture
      const empty = mkdtempSync(join(tmpdir(), 'nastech-empty-'));
      const refused = await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', empty]);
      expect(refused.code).toBe(2);
      expect(refused.err).toInclude('No image frames');
      rmSync(empty, { recursive: true, force: true });
    } finally {
      h.cleanup();
    }
  });

  test('a session cannot be registered twice, because the second would erase the first from the state', async () => {
    const h = makeHarness();
    try {
      const result = await throughProcess(h);
      expect(result.code).toBe(0);
      const again = await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session]);
      expect(again.code).toBe(2);
      expect(again.err).toInclude('already holds a session');
      expect(h.job().state).toBe('processed');
    } finally {
      h.cleanup();
    }
  });
});

describe('process', () => {
  test('without the native tools it prints the plan, refuses, and leaves the job where it was', async () => {
    const h = makeHarness();
    try {
      await h.run(['intake', '--job', 'job_01', '--item', 'itm_seiko', '--title', 'Seiko', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '420000']);
      writeFrames(h.session, 48);
      await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session]);
      h.write('source.glb', 'reconstruction mesh');
      const result = await h.run(
        PROCESS_ARGS.map((a) => (a === 'source.glb' ? join(h.workspace, 'source.glb') : a)),
        { env: { PATH: join(h.root, 'no-tools') } },
      );
      expect(result.code).toBe(4);
      expect(result.out).toInclude('PLAN — NOT EXECUTED, NO GEOMETRY PRODUCED');
      expect(result.out).toInclude('gltf-transform optimize');
      expect(result.err).toInclude('native_tool_missing');
      expect(result.err).toInclude('nothing was produced');
      expect(h.job().state).toBe('captured');
      expect(h.custodyLines().filter((line) => line.includes('"to_state":"processed"')).length).toBe(0);
      expect(h.has('produced/job_01.json')).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  test('the same refusal happens in a real child process, with a non-zero exit code', () => {
    const h = makeHarness();
    try {
      // stage the job the way the studio would, from a shell, then run `process` as a child so the
      // exit code the operator actually sees is the one under test
      const spawnArgs = [
        CLI_PATH,
        'intake', '--job', 'job_01', '--item', 'itm_seiko', '--title', 'Seiko', '--actor', 'officer_nomsa',
        '--studio', 'studio_cape_town', '--price-cents', '420000', '--workspace', h.workspace,
      ];
      const intake = spawnSync(process.execPath, spawnArgs, { cwd: h.root, env: SPAWN_ENV, encoding: 'utf8' });
      expect(intake.status).toBe(0);
      writeFrames(h.session, 48);
      const source = join(h.workspace, 'source.glb');
      writeFileSync(source, 'reconstruction mesh', 'utf8');
      const capture = spawnSync(
        process.execPath,
        [CLI_PATH, 'capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session, '--workspace', h.workspace],
        { cwd: h.root, env: SPAWN_ENV, encoding: 'utf8' },
      );
      expect(capture.status).toBe(0);

      const emptyBin = join(h.root, 'empty-bin');
      mkdirSync(emptyBin, { recursive: true });
      const child = spawnSync(
        process.execPath,
        [
          CLI_PATH, 'process', '--job', 'job_01', '--actor', 'baker_lika', '--source', source,
          '--reference', 'card=credit_card,units=12.4,source=frame_010', '--case-span-units', '5.79',
          '--workspace', h.workspace,
        ],
        // the interpreter must stay reachable, so only the tool directory is empty
        { cwd: h.root, env: { ...SPAWN_ENV, PATH: `${emptyBin}:${dirname(process.execPath)}` }, encoding: 'utf8' },
      );
      expect(child.status).toBe(4);
      expect(child.status).not.toBe(0);
      expect(child.stdout).toInclude('NO GEOMETRY PRODUCED');
      expect(child.stderr).toInclude('native_tool_missing');
      const job = JSON.parse(readFileSync(join(h.workspace, 'jobs', 'job_01.json'), 'utf8')) as CaptureJob;
      expect(job.state).toBe('captured');
      const custody = readFileSync(join(h.workspace, 'custody.jsonl'), 'utf8');
      expect(custody).not.toInclude('"to_state":"processed"');
      expect(custody.split('\n').filter((l) => l.length > 0).length).toBe(2);
    } finally {
      h.cleanup();
    }
  });

  test('a mis-scaled item stops the step before any geometry compute is spent', async () => {
    const h = makeHarness();
    try {
      installFakeTools(h.bin);
      await h.run(['intake', '--job', 'job_01', '--item', 'itm_wallclock', '--title', 'Wall clock', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '420000']);
      writeFrames(h.session, 48);
      await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session]);
      h.write('source.glb', 'reconstruction mesh');
      const result = await h.run([
        'process', '--job', 'job_01', '--actor', 'baker_lika', '--source', join(h.workspace, 'source.glb'),
        '--reference', 'card=credit_card,units=12.4,source=frame_010', '--case-span-units', '29',
      ]);
      expect(result.code).toBe(5);
      expect(result.err).toInclude('metric_out_of_window');
      expect(result.err).toInclude('200.2 mm');
      expect(h.job().state).toBe('captured');
      // no plan is even printed: the alignment question comes first
      expect(result.out).toBe('');
    } finally {
      h.cleanup();
    }
  });

  test('a tool that exits cleanly without writing bytes is refused as unproduced geometry', async () => {
    const h = makeHarness();
    try {
      const result = await throughProcess(h, 'silent');
      expect(result.code).toBe(4);
      expect(result.err).toInclude('geometry_not_produced');
      expect(result.err).toInclude('wrote no bytes');
      expect(h.job().state).toBe('captured');
      expect(h.has('produced/job_01.json')).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  test('a tool that fails mid-chain is refused with its own message attached', async () => {
    const h = makeHarness();
    try {
      const result = await throughProcess(h, 'fail');
      expect(result.code).toBe(4);
      expect(result.err).toInclude('geometry_not_produced');
      expect(result.err).toInclude('kdtree collapse');
      expect(h.job().state).toBe('captured');
    } finally {
      h.cleanup();
    }
  });

  test('with the tools present, the produced record carries the bytes that are on disk', async () => {
    const h = makeHarness();
    try {
      const result = await throughProcess(h);
      expect(result.code).toBe(0);
      expect(h.job().state).toBe('processed');
      // the median of the two readings, which with two observations is their mean
      expect(h.job().metricScaleMetersPerUnit).toBeCloseTo((0.0856 / 12.4 + 0.0856 / 12.41) / 2, 12);
      expect(h.job().caseDiameterMm).toBeGreaterThan(24);
      expect(h.job().caseDiameterMm).toBeLessThan(50);
      const produced = JSON.parse(h.read('produced/job_01.json')) as { produced: { id: string; bytes: number; sha256: string; path: string }[] };
      expect(produced.produced.map((p) => p.id)).toEqual([
        'ren_ast_itm_seiko_v1_lod0',
        'ren_ast_itm_seiko_v1_lod1',
        'ren_ast_itm_seiko_v1_lod2',
        'ren_ast_itm_seiko_v1_poster',
      ]);
      for (const item of produced.produced) {
        const onDisk = readFileSync(item.path);
        expect(item.bytes).toBe(onDisk.length);
        expect(item.sha256).toBe(createHash('sha256').update(onDisk).digest('hex'));
      }
      expect(h.custodyLines().length).toBe(3);
    } finally {
      h.cleanup();
    }
  });
});

describe('qc-auto', () => {
  test('a 30-frame session fails the coverage gate and the refusal is still recorded', async () => {
    const h = makeHarness();
    try {
      installFakeTools(h.bin);
      await h.run(['intake', '--job', 'job_01', '--item', 'itm_seiko', '--title', 'Seiko', '--actor', 'officer_nomsa', '--studio', 'studio_cape_town', '--price-cents', '420000']);
      writeFrames(h.session, 30);
      await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session]);
      h.write('source.glb', 'reconstruction mesh');
      await h.run(PROCESS_ARGS.map((a) => (a === 'source.glb' ? join(h.workspace, 'source.glb') : a)));
      h.write('qc/job_01.measures.json', JSON.stringify(GOOD_MEASURES));
      const result = await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally']);
      expect(result.code).toBe(6);
      expect(result.err).toInclude('qc_gate_failed');
      expect(result.err).toInclude('30 frames');
      expect(result.err).toInclude('>= 40 frames');
      expect(h.job().state).toBe('reshot');
      // the judgement and its consequence are both on the record, in order
      const history = h.custodyLines().map((line) => JSON.parse(line) as { to_state: string; evidence: string | null });
      expect(history.map((r) => r.to_state)).toEqual(['intake', 'captured', 'processed', 'qc_auto', 'reshot']);
      expect(history[3]!.evidence).toInclude('verdict=fail');
      expect(history[3]!.evidence).toInclude('coverage=30(FAIL)');
      expect(history[4]!.evidence).toInclude('qc_auto_refused');
      expect(h.job().scopeSupported).toBe('none');
    } finally {
      h.cleanup();
    }
  });

  test('--on-fail fail closes the session instead of sending it back', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      h.write('qc/job_01.measures.json', JSON.stringify({ ...GOOD_MEASURES, holeCount: 6 }));
      const result = await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally', '--on-fail', 'failed']);
      expect(result.code).toBe(6);
      expect(h.job().state).toBe('failed');
      const history = h.custodyLines().map((line) => JSON.parse(line) as { to_state: string });
      expect(history.map((r) => r.to_state)).toEqual(['intake', 'captured', 'processed', 'qc_auto', 'failed']);
    } finally {
      h.cleanup();
    }
  });

  test('an unparseable route leaves the judgement recorded and the routing undecided', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      h.write('qc/job_01.measures.json', JSON.stringify({ ...GOOD_MEASURES, holeCount: 6 }));
      const result = await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally', '--on-fail', 'sideways']);
      expect(result.code).toBe(2);
      expect(result.err).toInclude('--on-fail must be reshot or fail');
      // the failing gates are already on the record, and the job has not been sent anywhere
      expect(h.job().state).toBe('qc_auto');
      expect(h.job().autoQcVerdict).toBe('fail');
      expect(h.custodyLines().length).toBe(4);
    } finally {
      h.cleanup();
    }
  });

  test('a measurement sheet with a blank reading is refused rather than defaulted', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      h.write('qc/job_01.measures.json', JSON.stringify({ ...GOOD_MEASURES, sharpnessScore: null }));
      const result = await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally']);
      expect(result.code).toBe(2);
      expect(result.err).toInclude('not a finite number');
      // a refused judgement never becomes a custody entry
      expect(h.job().state).toBe('processed');
      expect(h.custodyLines().length).toBe(3);
    } finally {
      h.cleanup();
    }
  });

  test('a passing session records the scope its evidence supports', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      h.write('qc/job_01.measures.json', JSON.stringify(GOOD_MEASURES));
      const result = await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally']);
      expect(result.code).toBe(0);
      expect(result.out).toInclude('auto-QC PASSED');
      expect(result.out).toInclude('geometry_and_external_condition');
      expect(h.job().state).toBe('qc_auto');
      expect(h.job().autoQcVerdict).toBe('pass');
      expect(h.has('qc/job_01.report.json')).toBe(true);
    } finally {
      h.cleanup();
    }
  });
});

describe('qc-human', () => {
  test('an officer cannot claim more than the evidence, and the ask is on the record either way', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      h.write('qc/job_01.measures.json', JSON.stringify(GOOD_MEASURES));
      await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally']);
      // stage a job whose recorded evidence supports only the outer-condition claim. The CLI cannot
      // reach this pair in one run (a failing gate routes away from qc_auto), so the judgement sheet
      // it would have produced is written directly — the guard being tested is the one at the decision.
      h.write('jobs/job_01.json', `${JSON.stringify({ ...h.job(), scopeSupported: 'condition_only' as ClaimScope }, null, 2)}\n`);
      const tooWide = await h.run([
        'qc-human', '--job', 'job_01', '--actor', 'officer_thandi', '--decision', 'pass',
        '--reason', 'caseback photographed', '--claim-scope', 'geometry_and_external_condition',
      ]);
      expect(tooWide.code).toBe(2);
      expect(tooWide.err).toInclude('the QC evidence on this job supports "condition_only"');
      expect(h.job().state).toBe('qc_auto');
      expect(h.custodyLines().length).toBe(4);

      const narrower = await h.run([
        'qc-human', '--job', 'job_01', '--actor', 'officer_thandi', '--decision', 'pass',
        '--reason', 'caseback photographed', '--claim-scope', 'condition_only',
      ]);
      expect(narrower.code).toBe(0);
      expect(h.job().scopeGranted).toBe('condition_only');
      expect(h.job().scopeDecisionActor).toBe('officer_thandi');
      expect(h.job().scopeDecisionCustodySeq).toBe(5);
      expect(h.custodyLines()[4]).toInclude('claim_scope_asked=condition_only');
    } finally {
      h.cleanup();
    }
  });

  test('a decision that is not one of the three the pipeline knows is refused', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      const result = await h.run(['qc-human', '--job', 'job_01', '--actor', 'officer_thandi', '--decision', 'probably', '--reason', 'mood']);
      expect(result.code).toBe(2);
      expect(result.err).toInclude('must be pass, reshot or fail');
      expect(h.job().state).toBe('processed');
    } finally {
      h.cleanup();
    }
  });
});

describe('publish', () => {
  test('a job that never met an officer cannot be published', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      const result = await h.run(['publish', '--job', 'job_01', '--actor', 'publisher_adele']);
      expect(result.code).toBe(2);
      expect(result.err).toInclude('only a job an officer passed can be published');
      expect(h.job().state).toBe('processed');
    } finally {
      h.cleanup();
    }
  });

  test('--check-only validates the manifest and says plainly that nothing was uploaded', async () => {
    const h = makeHarness();
    try {
      await throughPublishableQc(h);
      const result = await h.run(['publish', '--job', 'job_01', '--actor', 'publisher_adele', '--check-only']);
      expect(result.code).toBe(0);
      expect(result.out).toInclude('WITHIN BUDGET');
      expect(result.out).toInclude('NO BYTES WERE UPLOADED AND THE JOB REMAINS "qc_human"');
      expect(h.job().state).toBe('qc_human');
      expect(h.custodyLines().length).toBe(5);
      expect(h.custodyLines().some((line) => line.includes('"to_state":"published"'))).toBe(false);
      const manifest = JSON.parse(h.read('manifests/ast_itm_seiko.v1.json')) as { claimScope: string; renditions: { bucketKey: string; bytes: number }[] };
      expect(manifest.claimScope).toBe('geometry_and_external_condition');
      for (const rendition of manifest.renditions) {
        expect(rendition.bucketKey).toInclude('private/media/ast_itm_seiko/v1/');
        expect(rendition.bytes).toBeGreaterThan(0);
      }
    } finally {
      h.cleanup();
    }
  });

  test('with no bucket available it exits non-zero and stays unpublished', async () => {
    const h = makeHarness();
    try {
      await throughPublishableQc(h);
      const result = await h.run(['publish', '--job', 'job_01', '--actor', 'publisher_adele']);
      expect(result.code).toBe(8);
      expect(result.err).toInclude('bucket_unavailable');
      expect(result.err).toInclude('Nothing was uploaded');
      expect(h.job().state).toBe('qc_human');
      expect(h.custodyLines().some((line) => line.includes('"to_state":"published"'))).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  test('a caption with no disclosure record behind it stops the publish', async () => {
    const h = makeHarness();
    try {
      await throughPublishableQc(h);
      h.write('captions/job_01.json', JSON.stringify([{ ...CAPTIONS[0], disclosureId: '' }]));
      const result = await h.run(['publish', '--job', 'job_01', '--actor', 'publisher_adele', '--check-only']);
      expect(result.code).toBe(2);
      expect(result.err).toInclude('disclosure record');
    } finally {
      h.cleanup();
    }
  });

  test('the full chain publishes, with every byte verified against the manifest', async () => {
    const h = makeHarness();
    const bucket = join(h.root, 'bucket');
    try {
      await throughPublishableQc(h);
      installFakeAws(h.bin, bucket);
      const sprite = join(h.root, 'turntable.jpg');
      writeFileSync(sprite, 'a strip of turntable frames', 'utf8');
      const result = await h.run(
        ['publish', '--job', 'job_01', '--actor', 'publisher_adele', '--sprite-file', sprite, '--sprite-frames', '12', '--sprite-px', '3072x256'],
        { env: { ...h.env(), ...CREDENTIAL_ENV, FAKE_AWS_STORE: bucket } },
      );
      expect(result.code).toBe(0);
      expect(result.out).toInclude('published');
      expect(result.out).toInclude('uploaded');
      expect(h.job().state).toBe('published');
      const history = h.custodyLines().map((line) => JSON.parse(line) as { to_state: string; evidence: string | null });
      expect(history.map((r) => r.to_state)).toEqual(['intake', 'captured', 'processed', 'qc_auto', 'qc_human', 'published']);
      expect(history[5]!.evidence).toInclude('scope=geometry_and_external_condition');
      expect(history[5]!.evidence).toInclude('transport=aws:nastech-capture-private');

      const calls = readFileSync(join(bucket, 'calls.log'), 'utf8').trim().split('\n');
      // only the two documented s3api verbs (plus the client probe), and no delete anywhere: the
      // pipeline writes an object and reads it back, and never removes or overwrites anything.
      for (const call of calls) expect(call === '--version' || call.startsWith('s3api ')).toBe(true);
      expect(calls.filter((c) => c.includes('put-object')).length).toBe(5);
      expect(calls.filter((c) => c.includes('head-object')).length).toBe(10); // once before, once to read back
      expect(calls.some((c) => /delete|rb\b|rm\b|sync/i.test(c))).toBe(false);

      const manifest = JSON.parse(h.read('manifests/ast_itm_seiko.v1.json')) as {
        claimScope: string;
        renditions: { id: string; kind: string; bytes: number; sha256: string; bucketKey: string }[];
      };
      expect(manifest.renditions.map((r) => r.bucketKey)).toEqual([
        'private/media/ast_itm_seiko/v1/lod0.glb',
        'private/media/ast_itm_seiko/v1/lod1.glb',
        'private/media/ast_itm_seiko/v1/lod2.glb',
        'private/media/ast_itm_seiko/v1/poster.jpg',
        'private/media/ast_itm_seiko/v1/poster-sprite.jpg',
      ]);
      // Every published size and digest is the file on disk, re-measured here: nothing in the manifest
      // is a number somebody typed, which is what the client's byte guard ends up trusting.
      const staged = JSON.parse(h.read('produced/job_01.json')) as { produced: { id: string; path: string }[] };
      const pathById = new Map(staged.produced.map((p) => [p.id, p.path]));
      pathById.set('ren_ast_itm_seiko_v1_sprite', sprite);
      for (const entry of manifest.renditions) {
        const body = readFileSync(pathById.get(entry.id)!);
        expect(entry.bytes).toBe(body.length);
        expect(entry.sha256).toBe(`sha256:${createHash('sha256').update(body).digest('hex')}`);
      }
    } finally {
      h.cleanup();
    }
  });

  test('re-publishing the same job is refused: a published job is never reopened', async () => {
    const h = makeHarness();
    const bucket = join(h.root, 'bucket');
    try {
      await throughPublishableQc(h);
      installFakeAws(h.bin, bucket);
      const env = { ...h.env(), ...CREDENTIAL_ENV, FAKE_AWS_STORE: bucket };
      const first = await h.run(['publish', '--job', 'job_01', '--actor', 'publisher_adele'], { env });
      expect(first.code).toBe(0);
      const second = await h.run(['publish', '--job', 'job_01', '--actor', 'publisher_adele'], { env });
      expect(second.code).toBe(2);
      expect(second.err).toInclude('only a job an officer passed can be published');
      expect(h.job().state).toBe('published');
    } finally {
      h.cleanup();
    }
  });
});

describe('reshot and status', () => {
  test('a re-shoot opens the next asset version and clears the stale judgement', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      h.write('qc/job_01.measures.json', JSON.stringify(GOOD_MEASURES));
      await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally']);
      const result = await h.run(['reshot', '--job', 'job_01', '--actor', 'qc_tally', '--reason', 'clasp reflection blows the highlights']);
      expect(result.code).toBe(0);
      expect(result.out).toInclude('asset version 2');
      const job = h.job();
      expect(job.state).toBe('reshot');
      expect(job.assetVersion).toBe(1);
      expect(job.autoQcVerdict).toBeNull();
      expect(job.scopeGranted).toBeNull();
      expect(job.sessionDir).toBeNull();

      // the next session re-enters at capture and opens version 2, which the keys then carry
      writeFrames(h.session, 48);
      const recapture = await h.run(['capture', '--job', 'job_01', '--actor', 'shooter_bongani', '--session', h.session]);
      expect(recapture.code).toBe(0);
      expect(h.job().assetVersion).toBe(2);
      expect(h.job().state).toBe('captured');
    } finally {
      h.cleanup();
    }
  });

  test('status shows the paper trail matching the custody chain', async () => {
    const h = makeHarness();
    try {
      await throughPublishableQc(h);
      const one = await h.run(['status', '--job', 'job_01']);
      expect(one.code).toBe(0);
      expect(one.out).toInclude('custody    VERIFIED');
      expect(one.out).toInclude('MATCHES');
      expect(one.out).toInclude('#001 ∅→intake');
      expect(one.out).toInclude('#005 qc_auto→qc_human');
      expect(one.out).toInclude('NAS-');

      const all = await h.run(['status']);
      expect(all.code).toBe(0);
      expect(all.out).toInclude('job_01');
      expect(all.out).toInclude('qc_human');
    } finally {
      h.cleanup();
    }
  });

  test('an edited custody file stops the pipeline rather than being quietly continued', async () => {
    const h = makeHarness();
    try {
      await throughPublishableQc(h);
      const file = join(h.workspace, 'custody.jsonl');
      const lines = readFileSync(file, 'utf8').trim().split('\n');
      const tampered = lines.map((line, i) => (i === 2 ? line.replace('"actor":"baker_lika"', '"actor":"baker_who"') : line));
      writeFileSync(file, `${tampered.join('\n')}\n`, 'utf8');
      const result = await h.run(['status', '--job', 'job_01']);
      expect(result.code).toBe(9);
      expect(result.err).toInclude('custody_chain_broken');
      expect(result.err).toInclude('unverified custody');
      // and the refusal happens again for a command that would move state
      const publish = await h.run(['publish', '--job', 'job_01', '--actor', 'publisher_adele', '--check-only']);
      expect(publish.code).toBe(9);
    } finally {
      h.cleanup();
    }
  });

  test('a job file edited into an unknown state is refused on read', async () => {
    const h = makeHarness();
    try {
      await throughProcess(h);
      h.write('jobs/job_01.json', `${JSON.stringify({ ...h.job(), state: 'done' as unknown as CaptureJobState }, null, 2)}\n`);
      const result = await h.run(['status', '--job', 'job_01']);
      expect(result.code).toBe(2);
      expect(result.err).toInclude('not a pipeline state');
    } finally {
      h.cleanup();
    }
  });

  test('a missing measurement sheet is refused instead of inventing numbers', async () => {
    const h = makeHarness();
    try {
      const processed = await throughProcess(h);
      expect(processed.code).toBe(0);
      const result = await h.run(['qc-auto', '--job', 'job_01', '--actor', 'qc_tally']);
      expect(result.code).toBe(2);
      expect(result.err).toInclude('will not invent the numbers it gates on');
      expect(h.job().state).toBe('processed');
    } finally {
      h.cleanup();
    }
  });

  test('every command in the table is wired to a handler that refuses on its own inputs', async () => {
    const h = makeHarness();
    try {
      expect(COMMANDS.length).toBe(8);
      for (const command of COMMANDS) {
        // no job passed: each command that needs one refuses on its required input rather than crashing.
        // `status` is the one job-less command, and it answers with an empty list.
        const result = await h.run([command, '--actor', 'someone']);
        expect(result.code).toBe(command === 'status' ? 0 : 2);
        expect(result.out + result.err).not.toInclude('TypeError');
        if (command === 'status') expect(result.out).toInclude('No jobs in');
      }
    } finally {
      h.cleanup();
    }
  });
});
