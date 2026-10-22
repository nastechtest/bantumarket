import { describe, it, expect, afterEach } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TIER_LABELS } from '@nastech/api-contracts';
import type { VerificationTier } from '@nastech/api-contracts';
import { VerificationBadge, isVerificationTier } from '../badge.js';

const TIERS: VerificationTier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];

const realWarn = console.warn;
afterEach(() => {
  console.warn = realWarn;
});

describe('VerificationBadge', () => {
  it('renders the exact contract string for each of the five tiers', () => {
    for (const tier of TIERS) {
      const markup = renderToStaticMarkup(<VerificationBadge tier={tier} />);
      expect(markup).toContain(`>${TIER_LABELS[tier]}<`);
      expect(markup).toContain(`data-tier="${tier}"`);
    }
  });

  it('refuses an out-of-vocabulary tier: renders nothing and warns in dev', () => {
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);
    const markup = renderToStaticMarkup(
      <VerificationBadge tier={'T9' as unknown as VerificationTier} />,
    );
    expect(markup).toBe('');
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('T9');
    expect(warnings[0]).toContain('TIER_LABELS');
  });

  it('refuses a "verified"-style string that is not a tier', () => {
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);
    expect(
      renderToStaticMarkup(<VerificationBadge tier={'verified' as unknown as VerificationTier} />),
    ).toBe('');
    expect(warnings.length).toBe(1);
  });

  it('isVerificationTier accepts only the five contract tiers', () => {
    expect(TIERS.every((t) => isVerificationTier(t))).toBe(true);
    expect(isVerificationTier('T6')).toBe(false);
    expect(isVerificationTier('verified')).toBe(false);
    expect(isVerificationTier(undefined)).toBe(false);
  });
});
