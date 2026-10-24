/**
 * The test runner: one process per workspace.
 *
 * `bun test` across the whole repo aborted with SIGABRT once every app had its own jsdom suite. The
 * abort landed inside a later file and moved with the file order, not with any assertion — a crash in
 * the runtime, not a failing test. A fresh process per workspace keeps each jsdom heap small and makes
 * a crash belong to one workspace instead of taking the run down with it.
 *
 * Order is packages first: a shared package that is broken should fail before 650 app tests run against
 * it. Every workspace's line is printed as it finishes, so a red run names its owner immediately.
 *
 * `bun run test -- --filter=web-staff` runs only matching workspaces (a substring match on the path).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { workspaces: readonly string[] };
const only = process.argv.find((arg) => arg.startsWith('--filter='))?.slice('--filter='.length) ?? null;

const dirs: string[] = [];
for (const pattern of pkg.workspaces) {
  const [parent, child] = pattern.split('/');
  if (parent === undefined || child !== '*') continue;
  for (const name of readdirSync(join(root, parent)).sort()) {
    const dir = join(parent, name);
    const candidate = join(root, dir);
    // A workspace has a package.json; `tooling/models` is a directory of generated assets, not a suite.
    if (statSync(candidate).isDirectory() && existsSync(join(candidate, 'package.json'))) dirs.push(dir);
  }
}

const selected = only === null ? dirs : dirs.filter((dir) => dir.includes(only));
if (selected.length === 0) {
  process.stderr.write(`[run-tests] no workspace matches ${only ?? ''}\n`);
  process.exit(2);
}

let failed = 0;
const failures: string[] = [];
for (const dir of selected) {
  const started = Date.now();
  try {
    execFileSync('bun', ['test', dir], { cwd: root, stdio: 'pipe', env: process.env });
    process.stdout.write(`ok   ${dir} (${Math.round((Date.now() - started) / 100) / 10}s)\n`);
  } catch (error) {
    failed += 1;
    failures.push(dir);
    const failure = error as { stdout?: Buffer; stderr?: Buffer };
    // bun writes failures to stderr; the stdout tail alone is just the banner.
    const out = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`;
    process.stdout.write(`${out.split('\n').slice(-30).join('\n')}\n`);
    process.stdout.write(`FAIL ${dir}\n`);
  }
}

process.stdout.write(
  failed === 0
    ? `\nall ${selected.length} workspaces passed\n`
    : `\n${failed} of ${selected.length} workspaces failed: ${failures.join(', ')}\n`,
);
process.exit(failed === 0 ? 0 : 1);
