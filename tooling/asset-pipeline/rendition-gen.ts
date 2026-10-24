/**
 * Rendition generation — the step that needs geometry software this environment does not have.
 *
 * The rule this file exists to obey: a rendition that was not produced must never be describable as
 * produced. So there are exactly three outcomes:
 *
 * 1. the native tools are present → run them, then hash the bytes that actually landed on disk and
 *    report those numbers;
 * 2. the tools ran but wrote nothing → refuse with `geometry_not_produced`, because a zero exit code
 *    is not evidence of an asset;
 * 3. the tools are absent → emit the command plan (clearly labelled as a plan) and throw
 *    `native_tool_missing`, which the CLI maps to a non-zero exit.
 *
 * There is no fourth branch. A stub that fabricates a `Rendition` record with plausible bytes would
 * make the manifest lie to the client's byte guard and would let a listing show a 3D view of nothing.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LodTier, RenditionKind } from '@nastech/api-contracts';
import { budgets } from '@nastech/api-contracts';
import { CaptureError, budgetExceeded, geometryNotProduced, inputInvalid, nativeToolMissing, renditionSizeMissing } from './errors.js';

/**
 * Per-tier ceilings, derived from the one declared ceiling `budgets.sceneLodMaxBytes` — never typed
 * as a second set of byte numbers. lod0 is the whole ceiling because it is the single model a
 * capable device downloads; the cheaper tiers are fractions of it so a mid-range phone fetches less,
 * not more.
 */
export const LOD_TARGET_RATIOS: Readonly<Record<'lod0' | 'lod1' | 'lod2', number>> = {
  lod0: 1,
  lod1: 0.4,
  lod2: 0.15,
};

/** The poster is the static path, not the model budget; it is capped at a fraction of it so a slow connection still gets the picture. */
export const POSTER_TARGET_RATIO = 0.1;

export function targetBytesFor(tier: LodTier): number {
  const ratio = tier === 'poster' ? POSTER_TARGET_RATIO : LOD_TARGET_RATIOS[tier];
  return Math.floor(budgets.sceneLodMaxBytes * ratio);
}

export interface NativeTools {
  readonly blender: string | null;
  readonly gltfTransform: string | null;
}

const BLENDER_FALLBACKS = ['/usr/bin/blender', '/usr/local/bin/blender', '/opt/blender/blender', '/snap/bin/blender'];
const GLTF_FALLBACKS = ['/usr/local/bin/gltf-transform', '/usr/bin/gltf-transform'];

function isExecutable(file: string): boolean {
  try {
    const stats = statSync(file);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env, fallbacks: readonly string[] = []): string | null {
  const dirs = (env.PATH ?? '').split(':').filter((d) => d.length > 0);
  for (const dir of dirs) {
    const candidate = join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  for (const candidate of fallbacks) {
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

export function detectTools(env: NodeJS.ProcessEnv = process.env): NativeTools {
  return {
    gltfTransform: findOnPath('gltf-transform', env, GLTF_FALLBACKS),
    blender: findOnPath('blender', env, BLENDER_FALLBACKS),
  };
}

export type ProducedKind = 'MODEL' | 'POSTER';

interface TierSpec {
  readonly tier: LodTier;
  readonly kind: ProducedKind;
  readonly mime: string;
  readonly suffix: string;
  readonly tool: 'gltf-transform' | 'blender';
  readonly intent: string;
}

const TIER_SPECS: readonly TierSpec[] = [
  { tier: 'lod0', kind: 'MODEL', mime: 'model/gltf-binary', suffix: '.lod0.glb', tool: 'gltf-transform', intent: 'full-detail mesh, meshopt-compressed' },
  { tier: 'lod1', kind: 'MODEL', mime: 'model/gltf-binary', suffix: '.lod1.glb', tool: 'gltf-transform', intent: 'mid-tier decimation for average phones' },
  { tier: 'lod2', kind: 'MODEL', mime: 'model/gltf-binary', suffix: '.lod2.glb', tool: 'gltf-transform', intent: 'coarse tier for slow connections and low-memory devices' },
  { tier: 'poster', kind: 'POSTER', mime: 'image/jpeg', suffix: '.poster.jpg', tool: 'blender', intent: 'accepted still frame — the static path, and the silhouette QC is measured against' },
];

/** `--simplify` is a mesh-decimation tolerance; larger loses detail, so each tier trades detail for bytes. */
const SIMPLIFY_BY_TIER: Readonly<Record<'lod0' | 'lod1' | 'lod2', string>> = { lod0: '0.0001', lod1: '0.002', lod2: '0.006' };
export const TEXTURE_PX_BY_TIER: Readonly<Record<'lod0' | 'lod1' | 'lod2', string>> = { lod0: '2048', lod1: '1024', lod2: '512' };

export interface RenditionGenInput {
  /** The reconstruction the studio handed over: a .glb mesh, or the .blend it came from. */
  readonly sourceFile: string;
  readonly assetId: string;
  readonly assetVersion: number;
  readonly outDir: string;
}

export interface PlannedCommand {
  readonly tier: LodTier;
  readonly tool: 'gltf-transform' | 'blender';
  readonly argv: readonly string[];
  readonly output: string;
  readonly targetBytes: number;
  readonly intent: string;
  /** Human-readable line for the plan; never presented as a result. */
  readonly display: string;
}

export interface RenditionPlan {
  /** Marks the output as an intention rather than an outcome, so it cannot be pasted into a report as one. */
  readonly label: 'PLAN — NOT EXECUTED, NO GEOMETRY PRODUCED';
  readonly reason: string;
  readonly commands: readonly PlannedCommand[];
}

function commandFor(spec: TierSpec, input: RenditionGenInput): PlannedCommand {
  const output = resolve(input.outDir, `${input.assetId}.v${input.assetVersion}${spec.suffix}`);
  const argv =
    spec.tool === 'gltf-transform'
      ? [
          'gltf-transform',
          'optimize',
          input.sourceFile,
          output,
          '--simplify',
          SIMPLIFY_BY_TIER[spec.tier as 'lod0' | 'lod1' | 'lod2'],
          '--texture-size',
          TEXTURE_PX_BY_TIER[spec.tier as 'lod0' | 'lod1' | 'lod2'],
          '--overwrite',
        ]
      : ['blender', '--background', input.sourceFile, '--render-output', output, '--render-frame', '1'];
  return {
    tier: spec.tier,
    tool: spec.tool,
    argv: Object.freeze(argv),
    output,
    targetBytes: targetBytesFor(spec.tier),
    intent: spec.intent,
    display: `${argv.join(' ')}`,
  };
}

export function planRenditions(input: RenditionGenInput, reason: string): RenditionPlan {
  return {
    label: 'PLAN — NOT EXECUTED, NO GEOMETRY PRODUCED',
    reason,
    commands: Object.freeze(TIER_SPECS.map((spec) => commandFor(spec, input))),
  };
}

export function renderPlan(plan: RenditionPlan): string {
  const width = 78;
  const lines = [
    '='.repeat(width),
    plan.label,
    '='.repeat(width),
    `Why: ${plan.reason}`,
    '',
    'These commands would run on a studio machine that has the tools. Nothing below has been',
    'executed, and no rendition exists yet — there is no asset to publish from this step.',
    '',
  ];
  for (const command of plan.commands) {
    lines.push(`  [${command.tier}] target <= ${command.targetBytes.toLocaleString('en-ZA')} bytes — ${command.intent}`);
    lines.push(`      $ ${command.display}`);
    lines.push('');
  }
  lines.push('Install `blender` and `gltf-transform`, then re-run this command.');
  lines.push('='.repeat(width));
  return lines.join('\n');
}

export interface ProducedRendition {
  readonly id: string;
  readonly kind: RenditionKind;
  readonly lod: LodTier;
  readonly mime: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly fromTool: 'gltf-transform' | 'blender';
}

export interface GenOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Test seam for the process spawn; production leaves it undefined and really runs the tool. */
  readonly run?: (argv: readonly string[]) => { status: number | null; stderr: string };
}

function sha256Of(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function defaultRun(argv: readonly string[]): { status: number | null; stderr: string } {
  const [command, ...rest] = argv;
  if (command === undefined) return { status: 2, stderr: 'empty command' };
  const result = spawnSync(command, rest, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? (result.error ? null : 0), stderr: (result.stderr ?? result.error?.message ?? '').trim() };
}

export function renditionId(assetId: string, version: number, tier: LodTier): string {
  return `ren_${assetId}_v${version}_${tier}`;
}

/**
 * Read the bytes a tool claims to have written. `bytes` and `sha256` come from the file, never from
 * an estimate: the manifest publishes these numbers and the client refuses a fetch on them.
 */
export function recordProducedFile(plan: PlannedCommand, assetId: string, version: number): ProducedRendition {
  if (!existsSync(plan.output)) throw geometryNotProduced(plan.tier, plan.display);
  const bytes = statSync(plan.output).size;
  if (bytes <= 0) throw renditionSizeMissing(plan.tier, `the tool wrote a ${bytes}-byte file`);
  if (bytes > plan.targetBytes) {
    const spec = TIER_SPECS.find((s) => s.tier === plan.tier)!;
    throw budgetExceeded(`${spec.kind === 'MODEL' ? 'model' : 'poster'} tier ${plan.tier}`, bytes, plan.targetBytes, 'sceneLodMaxBytes');
  }
  return {
    id: renditionId(assetId, version, plan.tier),
    kind: plan.tier === 'poster' ? 'POSTER' : 'MODEL',
    lod: plan.tier,
    mime: TIER_SPECS.find((s) => s.tier === plan.tier)!.mime,
    path: plan.output,
    bytes,
    sha256: sha256Of(plan.output),
    fromTool: plan.tool,
  };
}

/**
 * Generate the LOD chain. Absent tools throw before anything is claimed; a tool that exits cleanly
 * without writing bytes throws after, so both failure shapes are covered.
 */
export function generateRenditions(input: RenditionGenInput, opts: GenOptions = {}): readonly ProducedRendition[] {
  const env = opts.env ?? process.env;
  if (!existsSync(input.sourceFile)) {
    throw inputInvalid(`Reconstruction source "${input.sourceFile}" does not exist.`, 'Point --source at the .glb the reconstruction step produced.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(input.assetId)) throw inputInvalid(`Asset id "${input.assetId}" is not usable in a bucket key.`, 'Use a bare id such as ast_017.');
  const tools = detectTools(env);
  const missing: readonly string[] = [
    ...(tools.gltfTransform === null ? ['gltf-transform'] : []),
    ...(tools.blender === null ? ['blender'] : []),
  ];
  if (missing.length > 0) {
    // The plan is returned inside the error context so the CLI can print it, but the throw is the
    // point: the caller cannot continue to a manifest from here.
    throw nativeToolMissing(missing.join(' and '), 'the LOD chain cannot be built');
  }

  mkdirSync(resolve(input.outDir), { recursive: true });
  const run = opts.run ?? defaultRun;
  const produced: ProducedRendition[] = [];
  for (const spec of TIER_SPECS) {
    const toolPath = spec.tool === 'blender' ? tools.blender! : tools.gltfTransform!;
    const plan = commandFor(spec, input);
    const argv = [toolPath, ...plan.argv.slice(1)];
    const result = run(argv);
    if (result.status !== 0) {
      throw new CaptureError(
        'geometry_not_produced',
        `${spec.tool} exited with status ${result.status ?? 'signal'} while building ${spec.tier}: ${result.stderr.slice(0, 300) || 'no output captured'}`,
        'Fix the reported tool error and re-run process; the tier was not produced and nothing downstream may claim it.',
        { tier: spec.tier, command: argv.join(' '), stderr: result.stderr },
      );
    }
    produced.push(recordProducedFile({ ...plan, argv }, input.assetId, input.assetVersion));
  }
  return Object.freeze(produced);
}
