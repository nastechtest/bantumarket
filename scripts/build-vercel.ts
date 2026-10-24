/**
 * The Vercel build: one project, three apps, one origin.
 *
 * Vercel runs one build per project, and this repository is three Vite apps. Rather than ask for three
 * projects (three preview URLs, three sets of settings to drift), this assembles them into one output
 * tree:
 *
 *   vercel-out/index.html                 the buyer app, at `/`
 *   vercel-out/assets/…                   its hashed assets
 *   vercel-out/seller/index.html          the seller app, at `/seller`
 *   vercel-out/seller/assets/…            its own hashed assets, no collision with the buyer app
 *   vercel-out/staff/index.html           the staff app, at `/staff`
 *
 * Each app is built with `APP_BASE` set, so its own asset URLs carry the prefix and its router strips
 * it again when matching routes (see `stripBase` in each `router.tsx`). Serving the apps from the same
 * build at the root (`APP_BASE` unset) is unchanged, which is what the test suite and `bun run build`
 * still exercise.
 *
 * Run: `bun scripts/build-vercel.ts` (Vercel does exactly this; it is also runnable locally).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

interface AppBuild {
  readonly dir: string;
  readonly base: string;
  readonly target: string;
}

const root = resolve(import.meta.dir, '..');
const out = resolve(root, 'vercel-out');
const vite = resolve(root, 'node_modules/.bin/vite');

const APPS: readonly AppBuild[] = [
  { dir: 'apps/web-public', base: '/', target: '' },
  { dir: 'apps/web-seller', base: '/seller/', target: 'seller' },
  { dir: 'apps/web-staff', base: '/staff/', target: 'staff' },
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const app of APPS) {
  const cwd = resolve(root, app.dir);
  process.stdout.write(`→ ${app.dir} at ${app.base}\n`);
  execFileSync(vite, ['build', '--logLevel', 'warn'], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, APP_BASE: app.base },
  });
  const target = app.target === '' ? out : resolve(out, app.target);
  mkdirSync(target, { recursive: true });
  cpSync(resolve(cwd, 'dist'), target, { recursive: true });
}

process.stdout.write(`assembled ${out}\n`);
