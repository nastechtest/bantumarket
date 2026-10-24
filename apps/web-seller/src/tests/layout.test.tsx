import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import './dom-setup.js';
import { TAP_TARGET_PX, breakpoints, maxWidth, minWidth } from '../layout/breakpoints.js';
import { useIsDesktop } from '../layout/use-media.js';
import { PageHeader } from '../layout/page-header.js';
import { Section } from '../layout/section.js';
import { EmptyIllustration } from '../layout/empty-illustration.js';
import { HelpSlot } from '../layout/help-slot.js';
import { Footer } from '../layout/footer.js';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineState,
  RedirectingState,
} from '../layout/status.js';
import { AccountMenu } from '../layout/account-menu.js';
import { BrandMark, NavIcon, navGlyphFor } from '../layout/icons.js';
import { ErrorBoundary } from '../layout/error-boundary.js';
import { SceneBoundary } from '../layout/scene-boundary.js';
import { routeMotionPolicy, scenePolicy, SCENE_FAILURE_COPY } from '../nav/route-policy.js';
import { Routes } from '../router.js';
import type { SellerSessionState } from '../lib/session.js';
import { mount, click, stubMatchMedia, textOf } from './mount.js';

const SRC = new URL('..', import.meta.url).pathname;

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  if (button === undefined) throw new Error(`no button containing "${label}"`);
  return button as HTMLButtonElement;
}

describe('page structure components', () => {
  it('PageHeader owns the route h1 and its supporting text', () => {
    const markup = renderToStaticMarkup(
      <PageHeader title="My listings" eyebrow="Selling" description="Everything you have listed.">
        <button type="button">New listing</button>
      </PageHeader>,
    );
    expect(markup.match(/<h1/g)?.length).toBe(1);
    expect(markup).toContain('My listings');
    expect(markup).toContain('Selling');
    expect(markup).toContain('Everything you have listed.');
    expect(markup).toContain('>New listing</button>');
    expect(markup).not.toContain('<main');
  });

  it('Section is a labelled h2 block, not a second page heading', () => {
    const markup = renderToStaticMarkup(
      <Section title="Sales this month" description="Completed sales only.">
        <p>09 completed</p>
      </Section>,
    );
    const headingId = /<h2[^>]*id="([^"]+)"[^>]*>Sales this month<\/h2>/.exec(markup)?.[1];
    expect(headingId).toBeDefined();
    expect(markup).toContain(`aria-labelledby="${headingId!}"`);
    expect(markup.match(/<h1/g) ?? []).toHaveLength(0);
    expect(markup).toContain('09 completed');
  });

  it('the empty illustration is decorative only', () => {
    const markup = renderToStaticMarkup(<EmptyIllustration />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('<svg');
    expect(markup.replace(/<[^>]+>/g, '').trim()).toBe('');
  });
});

describe('help and footer', () => {
  it('renders a real contact as a tel/mailto link', () => {
    const markup = renderToStaticMarkup(
      <HelpSlot contact={{ kind: 'email', display: 'help@example.co.za' }} />,
    );
    expect(markup).toContain('href="mailto:help@example.co.za"');
    expect(markup).toContain('Email help@example.co.za');
  });

  it('says when no contact is configured instead of printing a dead address', () => {
    const markup = renderToStaticMarkup(<HelpSlot contact={null} />);
    expect(markup).toContain('has not been configured');
    expect(markup).not.toContain('mailto:');
    expect(markup).not.toContain('tel:');
  });

  it('Footer states where the numbers come from and carries help', () => {
    const markup = renderToStaticMarkup(
      <Footer support={{ kind: 'phone', display: '+27 82 000 5555' }} />,
    );
    expect(markup).toContain('seller workspace');
    expect(markup).toContain('read from the sale ledger');
    expect(markup).toContain('href="tel:+27820005555"');
  });
});

describe('chrome states', () => {
  it('loading is a live status with words, not only a spinner', () => {
    const markup = renderToStaticMarkup(<LoadingState detail="Fetching your drafts." />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Loading…');
    expect(markup).toContain('Fetching your drafts.');
  });

  it('empty state names the state, hides the drawing from assistive tech and offers an action', () => {
    const markup = renderToStaticMarkup(
      <EmptyState title="No listings yet" body="Start with the watch in your drawer.">
        <a href="/listings/new">Start a listing</a>
      </EmptyState>,
    );
    expect(markup).toContain('aria-label="No listings yet"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('Start a listing');
  });

  it('error state carries a reference, an alert role and a working retry', async () => {
    let retries = 0;
    const mounted = mount(
      <ErrorState
        body="The sale could not be fetched."
        reference="req_123"
        onRetry={() => {
          retries++;
        }}
      />,
    );
    expect(mounted.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(textOf(mounted.container)).toContain('req_123');
    await click(buttonByText(mounted.container, 'Try again'));
    expect(retries).toBe(1);
    mounted.unmount();
  });

  it('offline state is the same honest copy as the banner', () => {
    const markup = renderToStaticMarkup(<OfflineState />);
    expect(markup).toContain('You are offline');
    expect(markup).toContain('Nothing is being sent');
    expect(markup).toContain('role="status"');
  });

  it('redirect state offers a fallback link to the exact sign-in destination', () => {
    const markup = renderToStaticMarkup(
      <RedirectingState to="/sign-in?returnTo=%2Fpayouts" />,
    );
    expect(markup).toContain('Taking you to sign in');
    expect(markup).toContain('href="/sign-in?returnTo=%2Fpayouts"');
  });
});

describe('account menu', () => {
  const anonymous: SellerSessionState = { status: 'anonymous' };
  const checking: SellerSessionState = { status: 'checking' };
  const signedIn: SellerSessionState = {
    status: 'authenticated',
    seller: { sellerId: 'sel_01', displayName: 'Thandi Mokoena', tier: 'T2' },
  };

  it('anonymous is a plain sign-in link', () => {
    const markup = renderToStaticMarkup(<AccountMenu session={anonymous} onSignOut={() => {}} />);
    expect(markup).toContain('href="/sign-in"');
    expect(markup).toContain('Sign in');
    expect(markup).not.toContain('Sign out');
  });

  it('checking never pretends the seller is anonymous', () => {
    const markup = renderToStaticMarkup(<AccountMenu session={checking} onSignOut={() => {}} />);
    expect(markup).toContain('Checking session');
    expect(markup).not.toContain('href="/sign-in"');
  });

  it('signed in: name, design-system tier label, and a sign-out that fires', async () => {
    let signOuts = 0;
    const mounted = mount(
      <AccountMenu
        session={signedIn}
        onSignOut={() => {
          signOuts++;
        }}
      />,
    );
    const text = textOf(mounted.container);
    expect(text).toContain('Thandi');
    expect(text).toContain('ID checked');
    expect(text).not.toMatch(/\bverified\b/i);
    await click(buttonByText(mounted.container, 'Sign out'));
    expect(signOuts).toBe(1);
    mounted.unmount();
  });
});

describe('icons and breakpoints', () => {
  it('every nav destination gets a glyph; a new route falls back to the neutral dot', () => {
    expect(navGlyphFor('/')).toBe('dashboard');
    expect(navGlyphFor('/listings')).toBe('listings');
    expect(navGlyphFor('/orders')).toBe('sales');
    expect(navGlyphFor('/payouts')).toBe('payouts');
    expect(navGlyphFor('/messages')).toBe('messages');
    expect(navGlyphFor('/settings')).toBe('settings');
    expect(navGlyphFor('/reviews')).toBe('dot');
  });

  it('icons are decorative', () => {
    expect(renderToStaticMarkup(<NavIcon glyph="dashboard" />)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<BrandMark />)).toContain('aria-hidden="true"');
  });

  it('breakpoints are ordered and the touch target clears 44px from the token scale', () => {
    const values = Object.values(breakpoints);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(TAP_TARGET_PX).toBeGreaterThanOrEqual(44);
    expect(TAP_TARGET_PX).toBe(48);
    expect(minWidth('md')).toBe('(min-width: 740px)');
    expect(maxWidth('md')).toBe('(max-width: 739px)');
  });

  it('useIsDesktop follows matchMedia changes', async () => {
    const media = stubMatchMedia(false);
    function Probe() {
      return <span>{useIsDesktop() ? 'desktop' : 'compact'}</span>;
    }
    const mounted = mount(<Probe />);
    expect(textOf(mounted.container)).toBe('compact');
    await act(() => {
      media.flip(true);
    });
    expect(textOf(mounted.container)).toBe('desktop');
    mounted.unmount();
  });
});

describe('route policy', () => {
  const dashboard = Routes.find((route) => route.path === '/')!;
  const payouts = Routes.find((route) => route.path === '/payouts')!;
  const capture = Routes.find((route) => route.path === '/listings/:id/capture')!;

  it('motion is route-enter only and never on critical screens', () => {
    expect(routeMotionPolicy(dashboard).animate).toBe(true);
    expect(routeMotionPolicy(payouts).animate).toBe(false);
    expect(routeMotionPolicy(payouts).reason).toContain('do not animate');
  });

  it('only a scene route consumes the lazy scene policy; the route itself always survives', () => {
    expect(scenePolicy(capture).lazy).toBe(true);
    expect(scenePolicy(dashboard).lazy).toBe(false);
    const policy = scenePolicy(capture);
    expect(policy.routeSurvivesSceneFailure).toBe(true);
    expect(policy.failureCopy).toBe(SCENE_FAILURE_COPY);
    expect(policy.failureCopy).toContain('static path is enough');
  });
});

describe('boundaries keep the shell and the route alive', () => {
  it('a page crash keeps the frame honest, hides the error text and can retry', async () => {
    let shouldThrow = true;
    const reported: string[] = [];
    function Bomb() {
      if (shouldThrow) throw new Error('bank account 62012345678');
      return <p>RECOVERED SCREEN</p>;
    }

    const originalError = console.error;
    console.error = () => {};
    try {
      const mounted = mount(
        <ErrorBoundary
          support={{ kind: 'email', display: 'help@example.co.za' }}
          onError={(error) => reported.push(error.message)}
        >
          <Bomb />
        </ErrorBoundary>,
      );
      await mounted.flush();

      const text = textOf(mounted.container);
      expect(text).toContain('stopped working');
      expect(text).not.toContain('62012345678');
      expect(text).toContain('help@example.co.za');
      expect(reported).toEqual(['bank account 62012345678']);

      shouldThrow = false;
      await click(buttonByText(mounted.container, 'Try this screen again'));
      expect(textOf(mounted.container)).toContain('RECOVERED SCREEN');
      mounted.unmount();
    } finally {
      console.error = originalError;
    }
  });

  it('a scene crash replaces only the canvas slot; photos and notes stay mounted', async () => {
    const reported: string[] = [];
    function SceneBomb(): never {
      throw new Error('WebGL context lost');
    }

    const originalError = console.error;
    console.error = () => {};
    try {
      const mounted = mount(
        <div>
          <p>PHOTO 1</p>
          <SceneBoundary onError={(error) => reported.push(error.message)}>
            <SceneBomb />
          </SceneBoundary>
          <p>CONDITION NOTES</p>
        </div>,
      );
      await mounted.flush();

      const text = textOf(mounted.container);
      expect(text).toContain('PHOTO 1');
      expect(text).toContain('CONDITION NOTES');
      expect(text).toContain('static path is enough');
      expect(reported).toEqual(['WebGL context lost']);
      mounted.unmount();
    } finally {
      console.error = originalError;
    }
  });
});

describe('copy and accessibility discipline', () => {
  const scannedDirs = ['layout', 'nav', 'lib'];
  const files = [
    ...scannedDirs.flatMap((dir) => sourceFiles(join(SRC, dir))),
    join(SRC, 'bootstrap.ts'),
    join(SRC, 'styles.css'),
  ];

  it('never claims "verified", a guarantee, or authenticity in shell copy', () => {
    const hits: string[] = [];
    for (const file of files) {
      if (/\b(verified|guaranteed|authentic)\b/i.test(readFileSync(file, 'utf8'))) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  it('contains no TODO, FIXME or not-implemented placeholder', () => {
    const hits: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, 'utf8');
      if (/\b(TODO|FIXME)\b/.test(code) || /not implemented/i.test(code)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  it('styles use the token-derived touch target and remove route motion under reduction', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    const tap = /--nt-tap:(\d+)px/.exec(css)?.[1];
    expect(Number(tap)).toBe(TAP_TARGET_PX);
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('data-motion="none"');
    expect(css).toContain(':focus-visible');
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'tests' || entry.name.includes('.test.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}
