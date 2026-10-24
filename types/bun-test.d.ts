/**
 * Ambient types for `bun:test`, in ONE place.
 *
 * Three agents each wrote their own `declare module 'bun:test'` shim; the union of them was missing
 * `toMatch` and `toContainEqual`, so typecheck failed on suites that run green, and the winner among
 * duplicate module declarations depends on file order. One shim, referenced from the root tsconfig.
 *
 * The matcher set is deliberately permissive (`[name: string]` → callable). Bun's matchers are a
 * moving surface, and a hand-typed list that is one method short produces the exact failure this
 * file exists to remove: red typecheck on tests that pass.
 */
declare module 'bun:test' {
  export interface BunAssertionRefs {
    readonly not: BunMatchers;
    readonly resolves: BunMatchers;
    readonly rejects: BunMatchers;
  }

  /** Named matchers are listed for autocomplete; the index signature admits the rest. */
  export type BunMatchers = BunAssertionRefs & {
    toBe(...args: any[]): void;
    toEqual(...args: any[]): void;
    toStrictEqual(...args: any[]): void;
    toBeCloseTo(...args: any[]): void;
    toBeTruthy(...args: any[]): void;
    toBeFalsy(...args: any[]): void;
    toBeNull(...args: any[]): void;
    toBeUndefined(...args: any[]): void;
    toBeDefined(...args: any[]): void;
    toBeNaN(...args: any[]): void;
    toBeGreaterThan(...args: any[]): void;
    toBeGreaterThanOrEqual(...args: any[]): void;
    toBeLessThan(...args: any[]): void;
    toBeLessThanOrEqual(...args: any[]): void;
    toContain(...args: any[]): void;
    toContainEqual(...args: any[]): void;
    toInclude(...args: any[]): void;
    toMatch(...args: any[]): void;
    toMatchObject(...args: any[]): void;
    toHaveLength(...args: any[]): void;
    toHaveProperty(...args: any[]): void;
    toThrow(expected?: string | RegExp | Error | (new (...a: any[]) => Error)): void;
    toThrowError(expected?: string | RegExp | Error | (new (...a: any[]) => Error)): void;
    toBeInstanceOf(...args: any[]): void;
    // `any`, not a function type: with noUncheckedIndexedAccess every read of an index signature
    // gains `| undefined`, so a narrowly-typed catch-all makes each matcher Bun adds outside this
    // list an invoke-error on suites that run green. `Expectation` below already relies on this.
    [name: string]: any;
  };

  export interface Expectation {
    <T>(actual: T): BunMatchers;
    (actual: unknown, message: string): BunMatchers;
    any(constructor: unknown): unknown;
    objectContaining(expected: unknown): unknown;
    arrayContaining(expected: unknown): unknown;
    stringContaining(expected: string): unknown;
    stringMatching(expected: string | RegExp): unknown;
    assertions(count: number): void;
    fail(message?: string): never;
    fn(impl?: (...args: any[]) => any): any;
    [name: string]: any;
  }

  export const expect: Expectation;
  export function describe(name: string, fn: () => void): void;
  export function describeIf(cond: boolean): (name: string, fn: () => void) => void;
  export function it(name: string, fn: () => void | Promise<void>, timeout?: number): void;
  export const test: typeof it & { skip: typeof it; only: typeof it };

  export function skip(name: string, fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;

  /**
   * Bun's `mock()` exists at runtime and suites here use it; the shim predated the first one, so
   * the call sites typechecked red while running green — the exact failure this file exists to
   * remove. `mock.calls` is the part suites actually read, so it is typed; the rest of Bun's mock
   * surface stays as permissive as the matchers above.
   */
  export interface MockFunction<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): ReturnType<T>;
    readonly mock: { readonly calls: Parameters<T>[] };
  }

  export function mock<T extends (...args: any[]) => any>(impl?: T): MockFunction<T> & Record<string, any>;
}
