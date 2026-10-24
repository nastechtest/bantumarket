import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppFrame } from './app-frame.js';
import { Header } from './header.js';
import { AccountMenu, initialsOf } from './account-menu.js';
import { createOnlineStore, type OnlineSource } from '../lib/online-status.js';

function fakeSource(initial: boolean): OnlineSource & { emit: (v: boolean) => void } {
  let handler: ((v: boolean) => void) | null = null;
  return {
    initial: () => initial,
    subscribe(h) {
      handler = h;
      return () => {
        handler = null;
      };
    },
    emit: (v) => handler?.(v),
  };
}

const offlineStore = createOnlineStore(fakeSource(false));

describe('Header', () => {
  const markup = renderToStaticMarkup(
    <Header activePath="/search" account={{ signedIn: false }} online />,
  );

  it('is a landmark banner with the brand link home and no fabricated user', () => {
    expect(markup).toContain('<header');
    expect(markup).toContain('href="/"');
    expect(markup).toContain('NasTech Market');
    // Signed out never renders a greeting or an avatar: only the sign-in link.
    expect(markup).toContain('Sign in');
    expect(markup).not.toContain('<details');
  });

  it('words the offline state as text, not as pulsing motion', () => {
    const off = renderToStaticMarkup(
      <Header activePath="/" account={{ signedIn: false }} online={false} />,
    );
    expect(off).toContain('Offline');
    // spec §13.2: no trust state gets animation-by-accident in the chrome.
    expect(off).not.toMatch(/animation:/);
  });

  it('derives initials from the signed-in name without touching a photo', () => {
    expect(initialsOf('Thandiwe Nkosi')).toBe('TN');
    expect(initialsOf('abc')).toBe('A');
    expect(initialsOf('   ')).toBe('•');
    const signed = renderToStaticMarkup(
      <AccountMenu account={{ signedIn: true, displayName: 'Thandiwe Nkosi' }} />,
    );
    expect(signed).toContain('TN');
    expect(signed).toContain('Account menu for Thandiwe Nkosi');
    // A dead sign-out control would be a trust bug: absent handler means absent button.
    expect(signed).not.toContain('Sign out');
    const withHandler = renderToStaticMarkup(
      <AccountMenu account={{ signedIn: true, displayName: 'Thandiwe Nkosi' }} onSignOut={() => {}} />,
    );
    expect(withHandler).toContain('Sign out');
  });
});

describe('AppFrame', () => {
  const markup = renderToStaticMarkup(
    <AppFrame
      activePath="/"
      routeLabel="Home"
      account={{ signedIn: false }}
      support={null}
      onlineStore={offlineStore}
    >
      <p>page body</p>
    </AppFrame>,
  );

  it('puts the skip link first, before the header, as the first tab stop', () => {
    const skip = markup.indexOf('Skip to content');
    const header = markup.indexOf('<header');
    expect(skip).toBeGreaterThanOrEqual(0);
    expect(header).toBeGreaterThan(skip);
    expect(markup).toContain('href="#nt-main"');
    expect(markup).toContain('id="nt-main"');
  });

  it('shows the offline banner as a polite status region with an honest headline', () => {
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('You are offline');
  });

  it('renders no banner when the store says online', () => {
    const onlineStore = createOnlineStore(fakeSource(true));
    const on = renderToStaticMarkup(
      <AppFrame
        activePath="/"
        routeLabel="Home"
        account={{ signedIn: false }}
        support={null}
        onlineStore={onlineStore}
      >
        <p>body</p>
      </AppFrame>,
    );
    expect(on).not.toContain('nt-offline-banner');
  });
});
