/**
 * The control tree and the eight injections.
 *
 * This module is deliberately part of `src/`: the self-test and the test suite must exercise the
 * same fixture, and neither may touch the real repository. A control tree that passes every rule
 * plus one isolated injection per rule is the proof that the gate can both stay quiet and fire.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export type Tree = Readonly<Record<string, string>>;

const ROUTER_PUBLIC = `import type { ComponentType } from 'react';

export type RouteClass = 'app' | 'scene' | 'critical';
export interface RouteDef {
  readonly path: string;
  readonly class: RouteClass;
  readonly label: string;
}

export const Routes: readonly RouteDef[] = [
  { path: '/', class: 'app', label: 'Home' },
  { path: '/item/:id', class: 'scene', label: 'Item' },
  { path: '/sign-in', class: 'critical', label: 'Sign in' },
];

type Page = ComponentType<{ route: RouteDef }>;

const pages: Record<string, () => Promise<{ default: Page }>> = {
  '/': () => import('./routes/Home.js'),
  '/item/:id': () => import('./routes/ItemPage.js'),
  '/sign-in': () => import('./routes/SignIn.js'),
};
`;

const ROUTER_INTERNAL = `import type { ComponentType } from 'react';

export type RouteClass = 'app' | 'scene' | 'critical';
export interface RouteDef {
  readonly path: string;
  readonly class: RouteClass;
  readonly label: string;
}

export const Routes: readonly RouteDef[] = [
  { path: '/', class: 'app', label: 'Dashboard' },
];

type Page = ComponentType<{ route: RouteDef }>;

const pages: Record<string, () => Promise<{ default: Page }>> = {
  '/': () => import('./routes/Dashboard.js'),
};
`;

export const CONTROL_TREE: Tree = {
  'package.json': JSON.stringify({ name: 'tree-conformance-fixture', private: true, type: 'module' }, null, 2),

  'apps/web-public/package.json': JSON.stringify({ name: '@nastech/web-public', private: true, type: 'module' }, null, 2),
  'apps/web-public/src/router.tsx': ROUTER_PUBLIC,
  'apps/web-public/src/routes/Home.tsx': `import type { RouteDef } from '../router.js';
import { HomePage } from '../features/home/index.js';

export default function Home({ route }: { route: RouteDef }) {
  return <HomePage route={route} />;
}
`,
  'apps/web-public/src/routes/ItemPage.tsx': `export { default } from '../features/item/index.js';
`,
  'apps/web-public/src/routes/SignIn.tsx': `import type { RouteDef } from '../router.js';
import SignInPage from '../features/auth/index.js';

export default function SignIn({ route }: { route: RouteDef }) {
  return <SignInPage route={route} />;
}
`,
  'apps/web-public/src/layout/shell.tsx': `import type { ReactNode } from 'react';

/** The shell owns the document main; pages render sections inside it. */
export function Shell({ children }: { readonly children: ReactNode }) {
  return <main id="main">{children}</main>;
}
`,
  'apps/web-public/src/features/home/index.ts': `import type { RouteDef } from '../../router.js';
import { formatRm } from './format.js';

export function HomePage({ route }: { route: RouteDef }) {
  return <div data-path={route.path}>{formatRm(10)}</div>;
}

export default function HomeFeaturePage({ route }: { route: RouteDef }) {
  return <HomePage route={route} />;
}
`,
  'apps/web-public/src/features/home/format.ts': `import { brand } from '@nastech/tokens';
import { tone } from '@nastech/brand/tone';

export function formatRm(value: number): string {
  return \`R\${value} \${brand} \${tone}\`;
}
`,
  'apps/web-public/src/features/item/index.ts': `import type { RouteDef } from '../../router.js';

export default function ItemFeaturePage({ route }: { route: RouteDef }) {
  return <section data-path={route.path} />;
}
`,
  'apps/web-public/src/features/auth/index.ts': `import type { RouteDef } from '../../router.js';

export default function SignInPage({ route }: { route: RouteDef }) {
  return <section data-path={route.path} />;
}
`,
  'apps/web-public/src/features/auth/signin.guard.test.ts': `import { describe, expect, it } from 'bun:test';

describe('sign-in route guard', () => {
  it('an anonymous visitor is refused and redirected to the sign-in page', () => {
    const session = null; // no session
    expect(session).toBeNull();
    expect('/sign-in').toContain('sign-in');
  });
});
`,

  'apps/web-seller/package.json': JSON.stringify({ name: '@nastech/web-seller', private: true, type: 'module' }, null, 2),
  'apps/web-seller/src/router.tsx': ROUTER_INTERNAL,
  'apps/web-seller/src/routes/Dashboard.tsx': `import type { RouteDef } from '../router.js';

export default function Dashboard({ route }: { route: RouteDef }) {
  return <section data-path={route.path} />;
}
`,

  'apps/web-staff/package.json': JSON.stringify({ name: '@nastech/web-staff', private: true, type: 'module' }, null, 2),
  'apps/web-staff/src/router.tsx': ROUTER_INTERNAL,
  'apps/web-staff/src/routes/Dashboard.tsx': `import type { RouteDef } from '../router.js';

export default function Dashboard({ route }: { route: RouteDef }) {
  return <section data-path={route.path} />;
}
`,

  'packages/tokens/package.json': JSON.stringify(
    {
      name: '@nastech/tokens',
      private: true,
      version: '0.0.0',
      type: 'module',
      exports: { '.': './src/index.ts', './*': './src/*.ts' },
    },
    null,
    2,
  ),
  'packages/tokens/src/index.ts': `import { extra } from './extra.js';
export const brand = extra;
`,
  'packages/tokens/src/extra.ts': `export const extra = 'token';
`,

  'packages/brand/package.json': JSON.stringify(
    {
      name: '@nastech/brand',
      private: true,
      version: '0.0.0',
      type: 'module',
      exports: { '.': './src/index.ts', './tone': './src/tone.ts' },
    },
    null,
    2,
  ),
  'packages/brand/src/index.ts': `export const brandName = 'nastech';
`,
  'packages/brand/src/tone.ts': `export const tone = 'calm';
`,
};

const HOME_WITHOUT_ROUTE = `import type { RouteDef } from '../router.js';

export default function Home() {
  return <section />;
}
`;

const HOME_WITH_MAIN = `import type { RouteDef } from '../router.js';

export default function Home({ route }: { route: RouteDef }) {
  return <main data-path={route.path} />;
}
`;

const DASHBOARD_IMPORTING_APP = `import type { RouteDef } from '../router.js';
import { App } from '@nastech/web-public';

export default function Dashboard({ route }: { route: RouteDef }) {
  return <section data-path={route.path}>{String(App)}</section>;
}
`;

const CROSS_FEATURE = `import { SignInPage } from '../auth/index.js';

export const leak = SignInPage;
`;

const UNDECLARED_SUBPATH = `import { brand } from '@nastech/tokens';
import { tone } from '@nastech/brand/tone';
import { missing } from '@nastech/brand/missing';

export function formatRm(value: number): string {
  return \`R\${value} \${brand} \${tone} \${missing}\`;
}
`;

export interface Injection {
  readonly rule: number;
  readonly name: string;
  readonly inject: (root: string) => void;
}

export function writeTree(root: string, tree: Tree): void {
  for (const [rel, content] of Object.entries(tree)) {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  }
}

export function writeControlTree(root: string): void {
  writeTree(root, CONTROL_TREE);
}

export function createControlTree(prefix = 'nastech-tree-conformance-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeControlTree(root);
  return root;
}

export function removeTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

const write = (root: string, rel: string, content: string): void => {
  const abs = join(root, ...rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
};

function bigFileLines(count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i += 1) lines.push(`export const line${String(i).padStart(3, '0')} = ${i};`);
  return `${lines.join('\n')}\n`;
}

/**
 * Eight mutations, one per rule. Each is applied to a fresh copy of the control tree by the
 * self-test, so a rule that misses its injection cannot be hidden by another rule firing.
 */
export const INJECTIONS: readonly Injection[] = [
  {
    rule: 1,
    name: 'route page default export drops { route }',
    inject: (root) => write(root, 'apps/web-public/src/routes/Home.tsx', HOME_WITHOUT_ROUTE),
  },
  {
    rule: 2,
    name: 'feature home imports feature auth',
    inject: (root) => write(root, 'apps/web-public/src/features/home/cross.ts', CROSS_FEATURE),
  },
  {
    rule: 3,
    name: 'app web-seller imports app web-public',
    inject: (root) => write(root, 'apps/web-seller/src/routes/Dashboard.tsx', DASHBOARD_IMPORTING_APP),
  },
  {
    rule: 4,
    name: 'app imports an undeclared package subpath',
    inject: (root) => write(root, 'apps/web-public/src/features/home/format.ts', UNDECLARED_SUBPATH),
  },
  {
    rule: 5,
    name: 'authored .js under src',
    inject: (root) => write(root, 'apps/web-public/src/legacy.js', 'export const legacy = true;\n'),
  },
  {
    rule: 6,
    name: 'route page declares its own <main>',
    inject: (root) => write(root, 'apps/web-public/src/routes/Home.tsx', HOME_WITH_MAIN),
  },
  {
    rule: 7,
    name: 'src file over 600 lines',
    inject: (root) => write(root, 'apps/web-public/src/features/home/big.ts', bigFileLines(601)),
  },
  {
    rule: 8,
    name: 'critical route loses its no-session guard test',
    inject: (root) => rmSync(join(root, 'apps', 'web-public', 'src', 'features', 'auth', 'signin.guard.test.ts'), { force: true }),
  },
];
