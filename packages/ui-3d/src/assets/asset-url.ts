import { assetEntry, type AssetId } from './registry.js';

/**
 * Asset URL resolution.
 *
 * The three products share one origin and are served under `/seller` and `/staff` in production
 * while local development serves them at the root. A hard-coded `/assets/...` would 404 in both
 * prefixed deployments, so every generated model URL is built from a base — Vite's `BASE_URL`
 * when the bundler provides one, `''` (root) otherwise. Reading `import.meta.env` directly at
 * module scope is how a pre-render worker or `bun test` crashes at import time, hence the guarded
 * accessor below.
 */

/** Generated assets land in `public/assets/models/` of the consuming app. */
export const ASSET_MODEL_DIR = 'assets/models';

export interface ResolveAssetUrlOptions {
  /** Explicit base ('' for root, '/staff' for a prefixed deployment). */
  readonly base?: string | null;
  /** Environment carrier for the default base; defaults to this module's `import.meta`. */
  readonly meta?: ImportMeta;
}

type MetaWithEnv = ImportMeta & { readonly env?: { readonly BASE_URL?: unknown } };

/**
 * Normalise a deployment base to either `''` or a leading-slash path with no trailing slash.
 * Absolute bases (a CDN origin) are preserved; everything else is treated as a path prefix.
 */
export function normalizeBase(base: string | null | undefined): string {
  const trimmed = (base ?? '').trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '/') return '';
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('//');
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  if (absolute) return withoutTrailing;
  const withoutLeading = withoutTrailing.replace(/^\/+/, '');
  return withoutLeading === '' ? '' : `/${withoutLeading}`;
}

/** The configured base, total even when `import.meta.env` is absent (bun test, SSG). */
export function assetBaseUrl(meta: ImportMeta = import.meta): string {
  const raw = (meta as MetaWithEnv).env?.BASE_URL;
  return normalizeBase(typeof raw === 'string' ? raw : null);
}

/** Resolve an arbitrary file under the model directory; `file` is relative, never absolute. */
export function resolveAssetFile(file: string, options: ResolveAssetUrlOptions = {}): string {
  const base = options.base !== undefined ? normalizeBase(options.base) : assetBaseUrl(options.meta);
  const clean = file.replace(/^\/+/, '');
  return `${base}/${clean}`;
}

/**
 * Resolve a generated asset id to a fetchable URL.
 *
 * `resolveAssetUrl('wristwatch', { base: '' })` → `/assets/models/wristwatch.gltf`
 * `resolveAssetUrl('wristwatch', { base: '/staff/' })` → `/staff/assets/models/wristwatch.gltf`
 */
export function resolveAssetUrl(assetId: AssetId, options: ResolveAssetUrlOptions = {}): string {
  return resolveAssetFile(`${ASSET_MODEL_DIR}/${assetEntry(assetId).file}`, options);
}
