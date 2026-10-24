import type { CSSProperties } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import { offlineBannerCopy } from '../lib/online-status.js';
import { AccountMenu, type AccountState } from './account-menu.js';
import { BrandMark } from './icons.js';
import { PrimaryNav } from './primary-nav.js';
import { useIsDesktop } from './use-media.js';
import { useScrollDirection } from './use-scroll-direction.js';

/**
 * The header. The first-paint budget's chief enemy, so: no data fetching, no icons beyond the
 * inline set, no scene runtime (layout/fence.test.ts enforces), and hiding on scroll-down is
 * a transform on a sticky element — cheap, composited, and reverted at the page top always.
 *
 * It never shows trust states as motion (spec §13.2): the offline dot is a *dot with words*,
 * not a pulsing anything.
 */
export function Header({
  activePath,
  account,
  online,
}: {
  readonly activePath: string;
  readonly account: AccountState;
  readonly online: boolean;
}) {
  const isDesktop = useIsDesktop();
  const scroll = useScrollDirection();
  const hiding = isDesktop && scroll === 'down';

  const shell: CSSProperties = {
    background: tokens.surface.primary,
    borderBottom: `1px solid ${raw.color.ink100}`,
    fontFamily: raw.type.familyText,
    color: tokens.text.primary,
  };

  return (
    <header className={`nt-header${hiding ? ' nt-header--hiding' : ''}`} style={shell}>
      <div
        style={{
          maxWidth: tokens.layout.contentMax,
          marginInline: 'auto',
          padding: `${raw.space.s2} ${raw.space.s4}`,
          display: 'flex',
          alignItems: 'center',
          gap: raw.space.s4,
          minHeight: 52,
          boxSizing: 'border-box',
        }}
      >
        <a
          href="/"
          aria-label="NasTech Market — home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: raw.space.s2,
            color: tokens.text.primary,
            textDecoration: 'none',
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          <BrandMark />
          <span>NasTech Market</span>
        </a>

        {isDesktop ? <PrimaryNav activePath={activePath} /> : null}

        <span style={{ flex: 1 }} />

        {offlineBannerCopy(online) === null ? null : (
          <span
            data-testid="header-offline-dot"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: raw.space.s2,
              color: tokens.assurance.refused,
              fontSize: '0.85rem',
            }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            Offline
          </span>
        )}

        <AccountMenu account={account} />
      </div>
    </header>
  );
}
