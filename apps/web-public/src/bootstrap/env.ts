/**
 * Public environment access, one guarded door.
 *
 * `import.meta.env` exists under Vite and *may* exist elsewhere (Bun populates its own shape;
 * a pre-render worker may not). The shell runs before anything else has decided which, so
 * reading `import.meta.env.X` directly at module scope is how you get a crash at boot in the
 * least convenient place. Everything goes through `readPublicEnv`, which is total.
 */

export type PublicEnv = Record<string, string | boolean | undefined>;

type MetaWithEnv = ImportMeta & { env?: PublicEnv };

export function readPublicEnv(meta: ImportMeta = import.meta): PublicEnv {
  const env = (meta as MetaWithEnv).env;
  if (env && typeof env === 'object') return env;
  return {};
}

/** Only non-empty strings count as configured; `VITE_FOO=""` means "not set", in every ops sense. */
export function envString(env: PublicEnv, key: string): string | null {
  const value = env[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

export const publicEnv: PublicEnv = readPublicEnv();
