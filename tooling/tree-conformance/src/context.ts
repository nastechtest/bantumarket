/**
 * Shared run context and the violation shape.
 *
 * One walk of the tree, one app/package inventory, one file cache per run. Every rule receives the
 * same context, which is what makes the CLI, the self-test and the tests agree.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { RULE_BY_ID } from './rules.js';
import {
  createFileCache,
  findAppDirs,
  findPackageJsonDirs,
  isUnder,
  readPackageExports,
  walkFiles,
  type FileCache,
  type WalkedFile,
} from './scan.js';

export interface Violation {
  readonly rule: number;
  readonly ruleName: string;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface AppInfo {
  readonly dir: string;
  readonly name: string;
  readonly packageName: string | null;
  readonly routerFile: string;
  readonly srcDir: string;
  readonly files: readonly WalkedFile[];
}

export interface PackageInfo {
  readonly dir: string;
  readonly dirName: string;
  readonly name: string;
  readonly exportsValue: unknown;
  readonly error: string | null;
  readonly files: readonly WalkedFile[];
}

export interface Context {
  readonly root: string;
  readonly cache: FileCache;
  readonly files: readonly WalkedFile[];
  readonly apps: readonly AppInfo[];
  readonly packages: readonly PackageInfo[];
  readonly appByPackageName: ReadonlyMap<string, AppInfo>;
  readonly packageByDirName: ReadonlyMap<string, PackageInfo>;
  readonly packageByName: ReadonlyMap<string, PackageInfo>;
}

export function makeViolation(rule: number, file: string, line: number, message: string): Violation {
  return {
    rule,
    ruleName: RULE_BY_ID.get(rule)?.name ?? `rule-${rule}`,
    file,
    line: Math.max(1, line),
    message,
  };
}

export function featureNameOf(abs: string, app: AppInfo): string | null {
  const root = `${app.srcDir}/features/`;
  if (!abs.startsWith(root)) return null;
  const rest = abs.slice(root.length);
  const first = rest.split('/')[0];
  return first === undefined || first === '' ? null : first;
}

export function isFeatureFile(abs: string, app: AppInfo): boolean {
  return abs.startsWith(`${app.srcDir}/features/`);
}

function appPackageName(appDir: string): string | null {
  const file = join(appDir, 'package.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : null;
  } catch {
    return null;
  }
}

export function buildContext(root: string): Context {
  const cache = createFileCache();
  const files = walkFiles(root);
  const apps: AppInfo[] = findAppDirs(root).map((dir) => {
    const srcDir = join(dir, 'src');
    return {
      dir,
      name: basename(dir),
      packageName: appPackageName(dir),
      routerFile: join(srcDir, 'router.tsx'),
      srcDir,
      files: files.filter((f) => isUnder(f.abs, srcDir)),
    };
  });
  const packages: PackageInfo[] = findPackageJsonDirs(root).map((dir) => {
    const manifest = readPackageExports(dir, cache);
    return {
      dir,
      dirName: basename(dir),
      name: manifest.name,
      exportsValue: manifest.exportsValue,
      error: manifest.error,
      files: files.filter((f) => isUnder(f.abs, dir)),
    };
  });
  const packageByName = new Map<string, PackageInfo>();
  for (const p of packages) if (p.name !== '') packageByName.set(p.name, p);
  const packageByDirName = new Map<string, PackageInfo>();
  for (const p of packages) packageByDirName.set(p.dirName, p);
  const appByPackageName = new Map<string, AppInfo>();
  for (const a of apps) if (a.packageName !== null) appByPackageName.set(a.packageName, a);
  return { root, cache, files, apps, packages, appByPackageName, packageByDirName, packageByName };
}
