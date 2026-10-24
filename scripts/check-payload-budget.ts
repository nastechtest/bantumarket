#!/usr/bin/env bun
/**
 * Payload check (spec §13.4 budgets, 07 §4.2, gate D3).
 *
 * 07 §4.2 said, honestly, that every byte figure in it was a target and not a measurement. This
 * script makes one of them a measurement. It builds the app twice — once normal, once with
 * NO_3D=1 — and asserts three things:
 *
 *   1. the first-paint chunk of the item/search routes fits the original 170 KB budget;
 *   2. the scene chunk fits the 400 KB ceiling the 3D route class was given;
 *   3. the NO_3D build contains no renderer, which is the proof that no flow depends on 3D.
 *
 * Budgets come from `@nastech/api-contracts`, never from a number typed in here.
 *
 * Run: bun scripts/check-payload-budget.ts [--build] [--json]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { budgets } from '@nastech/api-contracts';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const APP = resolve(ROOT, 'apps/web-public');
const KB = 1024;

interface Chunk {
  readonly file: string;
  readonly rawBytes: number;
  readonly gzBytes: number;
}

function measure(dir: string): Chunk[] {
  const abs = resolve(APP, dir);
  if (!existsSync(abs)) throw new Error(`Missing build output: ${dir}. Run with --build, or run vite build first.`);
  return readdirSync(abs)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const buf = readFileSync(resolve(abs, f));
      return { file: f, rawBytes: buf.length, gzBytes: gzipSync(buf, { level: 9 }).length };
    })
    .sort((a, b) => b.gzBytes - a.gzBytes);
}

function total(chunks: Chunk[], match: (c: Chunk) => boolean): number {
  return chunks.filter(match).reduce((a, c) => a + c.gzBytes, 0);
}

const build = process.argv.includes('--build');
if (build) {
  const vite = resolve(ROOT, 'node_modules/.bin/vite');
  for (const [outDir, env] of [['dist', {}], ['dist-no3d', { NO_3D: '1' }]] as const) {
    execFileSync(vite, ['build', '--outDir', outDir, '--logLevel', 'error'], {
      cwd: APP,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
  }
}

const three = measure('dist/assets');
const no3d = measure('dist-no3d/assets');

const sceneChunk = three.find((c) => c.file.startsWith('scene-'));
const entryChunk = three.find((c) => c.file.startsWith('index-'));
const lazySceneChunks = three.filter((c) => /^(Home|Inspect|PilotWatch)-/.test(c.file));

/**
 * A renderer does not exist without its constructor name surviving minification of *strings*, and
 * `WebGLRenderer` appears in three's own error messages, so it is a reliable marker for "the
 * runtime is in this bundle" without needing a source map.
 */
const no3dRendererBytes = no3d
  .map((c) => readFileSync(resolve(APP, 'dist-no3d/assets', c.file), 'utf8'))
  .filter((src) => src.includes('WebGLRenderer') || src.includes('THREE.WebGL')).length;

const results = [
  {
    name: 'first-paint chunk within the 170 KB budget',
    actualKb: entryChunk ? entryChunk.gzBytes / KB : Infinity,
    limitKb: budgets.firstPaintJsKb,
    note: 'the entry chunk shared by every route class',
  },
  {
    name: 'scene chunk within the 400 KB 3D-inspection ceiling',
    actualKb: sceneChunk ? sceneChunk.gzBytes / KB : 0,
    limitKb: budgets.sceneExtraJsKb,
    note: 'three + @react-three/fiber + drei, gzipped',
  },
  {
    name: 'NO_3D build carries no renderer',
    actualKb: no3dRendererBytes,
    limitKb: 0,
    note: 'count of NO_3D chunks containing a WebGLRenderer marker',
  },
];

const fmt = (n: number) => n.toFixed(1);
let failed = 0;

if (process.argv.includes('--json')) {
  writeFileSync(
    resolve(ROOT, 'docs/measurements/payload.json'),
    JSON.stringify({ measuredAt: new Date().toISOString(), three, no3d, results }, null, 2),
  );
}

console.log('Measured payload (gzip):\n');
for (const c of three.slice(0, 6)) console.log(`  dist      ${c.file.padEnd(24)} ${fmt(c.gzBytes / KB).padStart(8)} KB gz  (${fmt(c.rawBytes / KB)} KB raw)`);
for (const c of no3d.slice(0, 3)) console.log(`  no-3d     ${c.file.padEnd(24)} ${fmt(c.gzBytes / KB).padStart(8)} KB gz`);
console.log(`\n  lazily-loaded scene chunks: ${lazySceneChunks.map((c) => `${c.file.split('-')[0]} ${fmt(c.gzBytes / KB)}KB`).join(', ') || 'none'}`);
console.log(`\nAssertions:`);

for (const r of results) {
  const ok = r.actualKb <= r.limitKb;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`        actual ${fmt(r.actualKb)} vs limit ${fmt(r.limitKb)} — ${r.note}`);
}

console.log(`\n${failed === 0 ? 'OK' : `${failed} assertion(s) failed`} — budgets read from @nastech/api-contracts.`);
process.exit(failed === 0 ? 0 : 1);
