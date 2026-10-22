/**
 * Bun's own globals, which @types/node does not declare: `import.meta.dir`, `import.meta.path`,
 * and the jsdom module (installed, untyped, and used by three packages' DOM setup files).
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { pretendToBeVisual?: boolean; url?: string });
    readonly window: Window & typeof globalThis;
    readonly windowProperties: Record<string, unknown>;
  }
}

interface ImportMeta {
  readonly dir: string;
  readonly path: string;
  readonly bun: string;
}
