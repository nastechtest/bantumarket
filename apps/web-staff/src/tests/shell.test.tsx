import { installDomGlobal } from './dom.js';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Routes } from '../router.js';
import type { RouteDef } from '../router.js';
import type { StaffSession } from '../shell/session.js';
import { ConsoleFrame } from '../layout/console-frame.js';
import { EmptyState, ErrorState, LoadingState } from '../layout/chrome-states.js';
import { allCapabilitiesSession, NOW, reviewerSession } from './fixtures.js';
import { markup, parse } from './render.js';

const roots: Root[] = [];

function renderFrame(route: RouteDef, session: StaffSession | null = allCapabilitiesSession()) {
  return markup(
    <ConsoleFrame route={route} session={session} now={NOW}>
      <section data-page="page">Page body</section>
    </ConsoleFrame>,
  );
}

function renderLive(route: RouteDef, session = allCapabilitiesSession()): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <ConsoleFrame route={route} session={session} now={NOW}>
        <section data-page="page">Page body</section>
      </ConsoleFrame>,
    );
  });
  return host;
}

function sourceFiles(directory: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }) as Dirent[]) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const SRC = fileURLToPath(new URL('..', import.meta.url));

beforeEach(() => {
  installDomGlobal();
  localStorage.clear();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
});

describe('console frame structure', () => {
  it('renders exactly one main landmark on every route', () => {
    for (const route of Routes) {
      const source = renderFrame(route);
      const host = parse(source);
      const mains = host.querySelectorAll('main');
      expect({ path: route.path, count: mains.length }).toEqual({ path: route.path, count: 1 });
      expect(mains[0]?.id).toBe('staff-main');
      expect(mains[0]?.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('keeps exactly one main landmark when the frame refuses the page', () => {
    const source = markup(
      <ConsoleFrame route={Routes.find((route) => route.path === '/payouts')!} session={reviewerSession()} now={NOW}>
        <section data-page="payouts">Payout rows</section>
      </ConsoleFrame>,
    );
    const host = parse(source);
    expect(host.querySelectorAll('main').length).toBe(1);
    expect(host.querySelector('[data-page="page"]')).toBeNull();
  });

  it('puts the skip link first and points it at the focusable main', () => {
    const route = Routes.find((candidate) => candidate.path === '/disputes')!;
    const host = parse(renderFrame(route));
    const shell = host.querySelector('.ops-shell');
    const skip = shell?.firstElementChild;
    expect(skip?.tagName).toBe('A');
    expect(skip?.getAttribute('href')).toBe('#staff-main');
    expect(skip?.textContent).toContain('Skip to main content');

    const main = host.querySelector('main');
    expect(main).not.toBeNull();
    expect(skip!.compareDocumentPosition(main!) & 4).toBe(4);
  });

  it('renders one named nav landmark and no scene destinations in the rail', () => {
    const host = parse(renderFrame(Routes.find((route) => route.path === '/')!));
    const navs = host.querySelectorAll('nav[aria-label="Staff sections"]');
    expect(navs.length).toBe(1);
    expect(navs[0]?.querySelectorAll('a').length).toBe(10);
    expect(navs[0]?.querySelector('a[href="/listings/:id/capture"]')).toBeNull();
  });

  it('keeps the signed-out shell navigable even with no session', () => {
    const host = parse(renderFrame(Routes.find((route) => route.path === '/')!, null));
    expect(host.querySelectorAll('main').length).toBe(1);
    expect(host.querySelector('[data-testid="staff-nav"]')).not.toBeNull();
    expect(host.textContent).toContain('Sign in to use the console');
    expect(host.querySelector('[data-page="page"]')).toBeNull();
  });

  it('marks critical routes in the chrome and ordinary routes not', () => {
    const critical = parse(renderFrame(Routes.find((route) => route.path === '/reconciliation')!));
    expect(critical.querySelector('[data-testid="critical-chip"]')).not.toBeNull();
    const ordinary = parse(renderFrame(Routes.find((route) => route.path === '/risk')!));
    expect(ordinary.querySelector('[data-testid="critical-chip"]')).toBeNull();
  });
});

describe('breadcrumbs', () => {
  function crumbsFor(path: string): HTMLElement {
    const route = Routes.find((candidate) => candidate.path === path)!;
    return parse(renderFrame(route));
  }

  it('omits the trail on the queue root', () => {
    expect(crumbsFor('/').querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  it('trails a detail route through its list route without echoing the id', () => {
    const host = crumbsFor('/disputes/:id');
    const links = Array.from(host.querySelectorAll('nav[aria-label="Breadcrumb"] a')).map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/disputes']);
    const items = Array.from(host.querySelectorAll('nav[aria-label="Breadcrumb"] li')).map((item) =>
      (item.textContent ?? '').replace(/\s+/g, ' ').replace('/', '').trim(),
    );
    expect(items).toEqual(['Disputes', 'Dispute case']);
    expect(host.querySelector('nav[aria-label="Breadcrumb"] [aria-current="page"]')?.textContent).toBe('Dispute case');
    expect(host.textContent).not.toContain('dsp_');
  });

  it('uses the nav group as the parent of a top-level screen', () => {
    const host = crumbsFor('/payouts');
    const links = Array.from(host.querySelectorAll('nav[aria-label="Breadcrumb"] a')).map((link) => link.getAttribute('href'));
    expect(links).toEqual([]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Payout ops');
  });
});

describe('chrome states', () => {
  it('renders loading, empty and error states in the main region', () => {
    expect(markup(<LoadingState />)).toContain('aria-busy="true"');
    expect(markup(<EmptyState title="No cases" body="Nothing is waiting." />)).toContain('data-state="empty"');
    expect(markup(<ErrorState body="The queue did not load." />)).toContain('role="alert"');
  });
});

describe('density preference', () => {
  it('toggles compact rows from the top bar and persists the choice per browser', () => {
    const route = Routes.find((candidate) => candidate.path === '/')!;
    const host = renderLive(route);
    const shell = host.querySelector<HTMLElement>('.ops-shell');
    expect(shell?.dataset['density']).toBe('comfortable');

    const toggle = Array.from(host.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Compact rows'),
    );
    expect(toggle).toBeDefined();
    act(() => {
      toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(shell?.dataset['density']).toBe('compact');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('nastech.staff.density.v1')).toBe('compact');

    const second = renderLive(route);
    expect(second.querySelector<HTMLElement>('.ops-shell')?.dataset['density']).toBe('compact');
  });
});

describe('main landmark ownership', () => {
  it('no route page or feature module renders its own main landmark', () => {
    const files = [...sourceFiles(join(SRC, 'routes')), ...sourceFiles(join(SRC, 'features'))];
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/<main[\s>]/.test(source) || /createElement\(\s*['"]main['"]/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the layout owns exactly one main element', () => {
    const files = sourceFiles(join(SRC, 'layout'));
    const owners = files.filter((file) => /<main[\s>]/.test(readFileSync(file, 'utf8')));
    expect(owners.map((file) => file.slice(SRC.length))).toEqual(['layout/console-frame.tsx']);
    expect(readFileSync(join(SRC, 'layout/console-frame.tsx'), 'utf8').match(/<main\s+id="staff-main"/g)?.length).toBe(1);
  });
});
