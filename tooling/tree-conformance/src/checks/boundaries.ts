/**
 * Rules 2, 3 and 4: feature isolation, app isolation, package direction.
 *
 * All three read the same import edges; splitting them by rule keeps the failure message tied to
 * one owner. A single edge is reported once by the rule whose boundary it crosses.
 */

import { join } from 'node:path';
import { featureNameOf, isFeatureFile, makeViolation, type Context, type Violation } from '../context.js';
import { exportsDeclare, isRelativeSpec, parseWorkspaceSpec, resolveRelative, scanImports, type WalkedFile } from '../scan.js';

export function ruleFeatureIsolation(ctx: Context): Violation[] {
  const out: Violation[] = [];
  for (const app of ctx.apps) {
    for (const file of app.files) {
      if (!isFeatureFile(file.abs, app)) continue;
      const from = featureNameOf(file.abs, app);
      if (from === null) continue;
      let text: string;
      try {
        text = ctx.cache.read(file.abs);
      } catch {
        continue;
      }
      for (const edge of scanImports(text)) {
        if (!isRelativeSpec(edge.spec)) continue;
        const target = resolveRelative(file.abs, edge.spec, ctx.cache);
        if (target === null) continue;
        const to = featureNameOf(target, app);
        if (to !== null && to !== from) {
          out.push(
            makeViolation(
              2,
              file.rel,
              edge.line,
              `feature '${from}' imports feature '${to}' via '${edge.spec}'; move the shared code to src/lib or a package`,
            ),
          );
        }
      }
    }
  }
  return out;
}

export function ruleAppIsolation(ctx: Context): Violation[] {
  const out: Violation[] = [];
  for (const app of ctx.apps) {
    for (const file of app.files) {
      let text: string;
      try {
        text = ctx.cache.read(file.abs);
      } catch {
        continue;
      }
      for (const edge of scanImports(text)) {
        if (isRelativeSpec(edge.spec)) {
          const target = resolveRelative(file.abs, edge.spec, ctx.cache);
          if (target === null) continue;
          const other = ctx.apps.find((a) => a.dir !== app.dir && target.startsWith(`${a.dir}/`));
          if (other !== undefined) {
            out.push(
              makeViolation(
                3,
                file.rel,
                edge.line,
                `app '${app.name}' imports app '${other.name}' via '${edge.spec}'; use a package or an HTTP contract`,
              ),
            );
          }
          continue;
        }
        const workspace = parseWorkspaceSpec(edge.spec);
        if (workspace === null) continue;
        const other = ctx.appByPackageName.get(workspace.pkg);
        if (other !== undefined && other.dir !== app.dir) {
          out.push(
            makeViolation(
              3,
              file.rel,
              edge.line,
              `app '${app.name}' imports app '${other.name}' ('${edge.spec}'); apps are separate deployments`,
            ),
          );
        }
      }
    }
  }
  return out;
}

function checkWorkspaceSurface(
  ctx: Context,
  file: WalkedFile,
  spec: string,
  line: number,
  out: Violation[],
): void {
  const workspace = parseWorkspaceSpec(spec);
  if (workspace === null) return;
  const target = ctx.packageByName.get(workspace.pkg);
  if (target === undefined) return;
  if (!exportsDeclare(target.exportsValue, workspace.subpath)) {
    const declared = typeof target.exportsValue === 'object' && target.exportsValue !== null
      ? Object.keys(target.exportsValue as Record<string, unknown>).filter((k) => k.startsWith('.')).join(', ')
      : '(none)';
    out.push(
      makeViolation(
        4,
        file.rel,
        line,
        `'${spec}' is not declared in ${target.name}'s exports map (declared: ${declared}); add the subpath to package.json or import a declared surface`,
      ),
    );
  }
}

export function rulePackageDirection(ctx: Context): Violation[] {
  const out: Violation[] = [];

  for (const pkg of ctx.packages) {
    if (pkg.error !== null) {
      out.push(makeViolation(4, `${pkg.dirName}/package.json`, 1, `cannot read package exports: ${pkg.error}`));
    }
    for (const file of pkg.files) {
      let text: string;
      try {
        text = ctx.cache.read(file.abs);
      } catch {
        continue;
      }
      for (const edge of scanImports(text)) {
        if (isRelativeSpec(edge.spec)) {
          const target = resolveRelative(file.abs, edge.spec, ctx.cache);
          if (target === null) continue;
          const app = ctx.apps.find((a) => target.startsWith(`${a.dir}/`));
          if (app !== undefined) {
            out.push(
              makeViolation(
                4,
                file.rel,
                edge.line,
                `package '${pkg.dirName}' imports app '${app.name}' via '${edge.spec}'; the dependency arrow points the wrong way`,
              ),
            );
            continue;
          }
          const other = ctx.packages.find((p) => p.dir !== pkg.dir && target.startsWith(`${p.dir}/`));
          if (other !== undefined) {
            out.push(
              makeViolation(
                4,
                file.rel,
                edge.line,
                `package '${pkg.dirName}' walks into package '${other.dirName}' via '${edge.spec}'; import its declared exports instead`,
              ),
            );
          }
          continue;
        }
        const workspace = parseWorkspaceSpec(edge.spec);
        if (workspace === null) continue;
        const app = ctx.appByPackageName.get(workspace.pkg);
        if (app !== undefined) {
          out.push(
            makeViolation(
              4,
              file.rel,
              edge.line,
              `package '${pkg.dirName}' imports app '${app.name}' ('${edge.spec}'); packages must never depend on apps`,
            ),
          );
          continue;
        }
        if (workspace.pkg !== pkg.name) checkWorkspaceSurface(ctx, file, edge.spec, edge.line, out);
      }
    }
  }

  for (const file of ctx.files) {
    if (ctx.packages.some((p) => file.abs.startsWith(`${p.dir}/`))) continue;
    let text: string;
    try {
      text = ctx.cache.read(file.abs);
    } catch {
      continue;
    }
    for (const edge of scanImports(text)) {
      if (isRelativeSpec(edge.spec)) {
        const target = resolveRelative(file.abs, edge.spec, ctx.cache);
        if (target === null) continue;
        const targetPkg = ctx.packages.find((p) => target.startsWith(`${p.dir}/`));
        if (targetPkg !== undefined) {
          out.push(
            makeViolation(
              4,
              file.rel,
              edge.line,
              `relative walk into package '${targetPkg.dirName}' via '${edge.spec}' bypasses its exports map; import '${targetPkg.name}' or a declared subpath`,
            ),
          );
        }
        continue;
      }
      checkWorkspaceSurface(ctx, file, edge.spec, edge.line, out);
    }
  }
  return out;
}
