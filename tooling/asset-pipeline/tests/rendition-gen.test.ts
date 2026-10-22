import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { budgets } from '@nastech/api-contracts';
import { CaptureError } from '../errors.js';
import {
  LOD_TARGET_RATIOS,
  detectTools,
  generateRenditions,
  planRenditions,
  renderPlan,
  targetBytesFor,
  type RenditionGenInput,
} from '../rendition-gen.js';

/**
 * A fake native tool, because the point of this suite is the pipeline's behaviour around the tool,
 * not the tool. Each fake takes the real argv contract (output path is the .glb or .jpg argument) and
 * does exactly one of: write bytes, write nothing, write too much, or fail.
 */
function fakeToolBin(dir: string, behaviour: 'write' | 'silent' | 'oversize' | 'fail'): string {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const bodies: Record<typeof behaviour, string> = {
    write: `out=""
for a in "$@"; do case "$a" in *.glb|*.jpg) out="$a";; esac; done
[ -n "$out" ] || { echo "no output path given" >&2; exit 64; }
printf 'FAKE-GEOMETRY-FOR-%s' "$out" > "$out"`,
    silent: `exit 0`,
    oversize: `out=""
for a in "$@"; do case "$a" in *.glb|*.jpg) out="$a";; esac; done
head -c 3000000 /dev/zero > "$out"`,
    fail: `echo "kdtree: reconstruction has 0 vertices" >&2
exit 3`,
  };
  const script = `#!/usr/bin/env bash\nset -e\n${bodies[behaviour]}\n`;
  for (const name of ['gltf-transform', 'blender']) {
    const path = join(bin, name);
    writeFileSync(path, script, 'utf8');
    chmodSync(path, 0o755);
  }
  return bin;
}

function emptyBin(dir: string): string {
  const bin = join(dir, 'empty-bin');
  mkdirSync(bin, { recursive: true });
  return bin;
}

function studioFixture(behaviour: 'write' | 'silent' | 'oversize' | 'fail' = 'write'): { input: RenditionGenInput; env: NodeJS.ProcessEnv; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'rendition-'));
  const source = join(dir, 'reconstruction.glb');
  writeFileSync(source, 'RECON', 'utf8');
  const outDir = join(dir, 'out');
  return {
    input: { sourceFile: source, assetId: 'ast_017', assetVersion: 1, outDir },
    env: { PATH: fakeToolBin(dir, behaviour) },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('rendition generation without the native tools', () => {
  test('neither tool exists in this environment, which the detector reports honestly', () => {
    const tools = detectTools({ PATH: emptyBin(mkdtempSync(join(tmpdir(), 'rendition-none-'))) });
    expect(tools.gltfTransform).toBeNull();
    expect(tools.blender).toBeNull();
  });

  test('absent tools raise a typed failure whose exit code is non-zero', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rendition-absent-'));
    const source = join(dir, 'reconstruction.glb');
    writeFileSync(source, 'RECON', 'utf8');
    let caught: unknown;
    try {
      generateRenditions({ sourceFile: source, assetId: 'ast_017', assetVersion: 1, outDir: join(dir, 'out') }, { env: { PATH: emptyBin(dir) } });
    } catch (error) {
      caught = error;
    }
    const error = caught as CaptureError;
    expect(error).toBeInstanceOf(CaptureError);
    expect(error.code).toBe('native_tool_missing');
    expect(error.exitCode).toBe(4);
    expect(error.exitCode).not.toBe(0);
    expect(error.operatorSentence).toInclude('nothing was produced');
  });

  test('the refusal is a labelled plan, not a fabricated result', () => {
    const fixture = studioFixture('write');
    const plan = planRenditions({ ...fixture.input, outDir: join('/tmp', 'unused') }, 'gltf-transform and blender are not installed');
    const text = renderPlan(plan);
    expect(text).toInclude('PLAN — NOT EXECUTED, NO GEOMETRY PRODUCED');
    expect(text).toInclude('gltf-transform optimize');
    expect(text).toInclude('blender --background');
    expect(plan.commands.length).toBe(4);
    expect(plan.commands.map((c) => c.tier)).toEqual(['lod0', 'lod1', 'lod2', 'poster']);
    expect(text).not.toInclude('sha256:');
    fixture.cleanup();
  });

  test('a plan cannot be mistaken for produced bytes: there is no rendition record in it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rendition-plan-'));
    const source = join(dir, 'reconstruction.glb');
    writeFileSync(source, 'RECON', 'utf8');
    let caught: unknown;
    try {
      generateRenditions({ sourceFile: source, assetId: 'ast_017', assetVersion: 1, outDir: join(dir, 'out') }, { env: { PATH: emptyBin(dir) } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CaptureError);
    expect(statSync(dir).isDirectory()).toBe(true);
    // The step that would have written geometry wrote nothing at all.
    expect(() => statSync(join(dir, 'out', 'ast_017.v1.lod0.glb'))).toThrow();
    const error = caught as CaptureError;
    expect(JSON.stringify(error.toJSON())).not.toInclude('"bytes":');
  });
});

describe('rendition generation with the tools present', () => {
  test('each tier is read back off the disk: real bytes, real digest', () => {
    const fixture = studioFixture('write');
    const produced = generateRenditions(fixture.input, { env: fixture.env });
    expect(produced.length).toBe(4);
    expect(produced.map((p) => p.lod)).toEqual(['lod0', 'lod1', 'lod2', 'poster']);
    for (const rendition of produced) {
      expect(statSync(rendition.path).size).toBe(rendition.bytes);
      expect(rendition.bytes).toBeGreaterThan(0);
      expect(rendition.sha256).toBe(createHash('sha256').update(readFileSync(rendition.path)).digest('hex'));
    }
    expect(produced.find((p) => p.lod === 'poster')!.kind).toBe('POSTER');
    expect(produced.find((p) => p.lod === 'lod0')!.kind).toBe('MODEL');
    expect(produced[0]!.id).toBe('ren_ast_017_v1_lod0');
    fixture.cleanup();
  });

  test('a tool that exits cleanly without writing bytes is refused, not recorded', () => {
    const fixture = studioFixture('silent');
    let caught: unknown;
    try {
      generateRenditions(fixture.input, { env: fixture.env });
    } catch (error) {
      caught = error;
    }
    expect((caught as CaptureError).code).toBe('geometry_not_produced');
    expect((caught as CaptureError).exitCode).not.toBe(0);
    fixture.cleanup();
  });

  test('a tool that fails is refused with its own error attached', () => {
    const fixture = studioFixture('fail');
    let caught: unknown;
    try {
      generateRenditions(fixture.input, { env: fixture.env });
    } catch (error) {
      caught = error;
    }
    const error = caught as CaptureError;
    expect(error.code).toBe('geometry_not_produced');
    expect(error.operatorSentence).toInclude('kdtree');
    fixture.cleanup();
  });

  test('a tier that comes back fatter than its target is refused at generation', () => {
    const fixture = studioFixture('oversize');
    let caught: unknown;
    try {
      generateRenditions(fixture.input, { env: fixture.env });
    } catch (error) {
      caught = error;
    }
    const error = caught as CaptureError;
    expect(error.code).toBe('budget_exceeded');
    expect(error.context.limitBytes).toBe(budgets.sceneLodMaxBytes);
    fixture.cleanup();
  });

  test('a source that does not exist is refused before any plan is printed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rendition-nosource-'));
    expect(() =>
      generateRenditions({ sourceFile: join(dir, 'missing.glb'), assetId: 'ast_1', assetVersion: 1, outDir: dir }, { env: { PATH: fakeToolBin(dir, 'write') } }),
    ).toThrow(CaptureError);
  });

  test('an asset id that cannot be a bucket key is refused', () => {
    const fixture = studioFixture('write');
    expect(() => generateRenditions({ ...fixture.input, assetId: 'ast 017/../evil' }, { env: fixture.env })).toThrow(CaptureError);
    fixture.cleanup();
  });
});

describe('LOD targets', () => {
  test('every target is a fraction of the one declared ceiling, never a second number', () => {
    expect(targetBytesFor('lod0')).toBe(budgets.sceneLodMaxBytes);
    expect(targetBytesFor('lod1')).toBe(Math.floor(budgets.sceneLodMaxBytes * LOD_TARGET_RATIOS.lod1));
    expect(targetBytesFor('lod2')).toBe(Math.floor(budgets.sceneLodMaxBytes * LOD_TARGET_RATIOS.lod2));
    expect(targetBytesFor('poster')).toBeLessThan(targetBytesFor('lod2'));
    for (const tier of ['lod0', 'lod1', 'lod2', 'poster'] as const) {
      expect(targetBytesFor(tier)).toBeGreaterThan(0);
      expect(targetBytesFor(tier)).toBeLessThanOrEqual(budgets.sceneLodMaxBytes);
    }
  });
});
