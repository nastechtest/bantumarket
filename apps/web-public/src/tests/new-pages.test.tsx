import { describe, expect, it } from 'bun:test';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RouteDef } from '../router.js';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { HelpCentre } from '../features/help/index.js';
import { SellLanding } from '../features/sell/index.js';
import { AccountOverview } from '../features/account/index.js';
import { PrivacyNotice, ReturnsPolicy, TermsOfSale, HumansPage } from '../features/legal/index.js';
import Safety from '../routes/Safety.js';
import SafetyHowItWorks from '../routes/SafetyHowItWorks.js';
import SafetyMeetSafely from '../routes/SafetyMeetSafely.js';
import SafetyScamPatterns from '../routes/SafetyScamPatterns.js';
import SafetyReport from '../routes/SafetyReport.js';
import SafetyTrust from '../routes/SafetyTrust.js';
import SafetyBlocking from '../routes/SafetyBlocking.js';
import SafetyFees from '../routes/SafetyFees.js';
import SafetyProhibited from '../routes/SafetyProhibited.js';
import SafetyPopia from '../routes/SafetyPopia.js';
import SafetyChildren from '../routes/SafetyChildren.js';
import LegalPrivacy from '../routes/LegalPrivacy.js';
import LegalReturns from '../routes/LegalReturns.js';
import LegalTerms from '../routes/LegalTerms.js';
import LegalHumans from '../routes/LegalHumans.js';
import PrivacyNoticeAlias from '../routes/PrivacyNotice.js';

const route = (path: string, label: string): RouteDef => ({ path, class: 'first-paint', label });

const safetyCases: readonly { readonly path: string; readonly label: string; readonly page: ComponentType<{ route: RouteDef }>; readonly heading: string; readonly extra: string }[] = [
  { path: '/safety', label: 'Safety', page: Safety, heading: 'Safety, trust and reporting', extra: '/safety/report' },
  { path: '/safety/how-it-works', label: 'How a sale works', page: SafetyHowItWorks, heading: 'How a sale works here', extra: 'COMPLETED' },
  { path: '/safety/meet-safely', label: 'Meeting safely', page: SafetyMeetSafely, heading: 'Meeting safely', extra: '10111' },
  { path: '/safety/scam-patterns', label: 'Scam patterns', page: SafetyScamPatterns, heading: 'four patterns', extra: 'WhatsApp' },
  { path: '/safety/report', label: 'Report', page: SafetyReport, heading: 'Report a listing', extra: 'No account needed' },
  { path: '/safety/trust', label: 'Trust', page: SafetyTrust, heading: 'The five tier phrases', extra: 'What a tier is not' },
  { path: '/safety/blocking', label: 'Blocking', page: SafetyBlocking, heading: 'Sellers you have muted', extra: 'Loading your mute list' },
  { path: '/safety/policy/fees', label: 'Fees', page: SafetyFees, heading: 'Fees', extra: 'R270 per item' },
  { path: '/safety/policy/prohibited', label: 'Prohibited', page: SafetyProhibited, heading: 'What may not be listed', extra: 'Counterfeit Goods Act' },
  { path: '/safety/policy/popia', label: 'POPIA', page: SafetyPopia, heading: 'Your personal information', extra: 'privacy@nastech.co.za' },
  { path: '/safety/policy/children', label: 'Children', page: SafetyChildren, heading: 'Children on this platform', extra: 'must be 18' },
];

describe('safety routes render the existing feature', () => {
  for (const item of safetyCases) {
    it(`${item.path} renders its section and the safety content`, () => {
      const Page = item.page;
      const markup = renderToStaticMarkup(<Page route={route(item.path, item.label)} />);
      expect(markup).toContain(item.heading);
      expect(markup).toContain(item.extra);
      expect(markup).not.toContain('<main');
    });
  }
});

describe('account overview', () => {
  it('links orders, disputes and the POPIA request without pretending to be the order screen', () => {
    const markup = renderToStaticMarkup(<AccountOverview />);
    expect(markup).toContain('data-testid="account-overview"');
    expect(markup).toContain('href="/orders"');
    expect(markup).toContain('href="/account/data-request"');
    expect(markup).toContain('A dispute starts from the order');
  });
});

describe('help centre', () => {
  it('prints the ZAR fee facts and the capture break-even', () => {
    const markup = renderToStaticMarkup(<HelpCentre />);
    expect(markup).toContain('0%');
    expect(markup).toContain('R0');
    expect(markup).toContain('R270');
    expect(markup).toContain('R2,700');
    expect(markup).toContain('R4,200');
    expect(markup).toContain('R420');
  });

  it('uses the contract claim-scope sentence instead of promising authenticity', () => {
    const markup = renderToStaticMarkup(<HelpCentre />);
    expect(markup).toContain(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
    expect(markup.toLowerCase()).not.toContain('guaranteed genuine');
  });
});

describe('selling landing page', () => {
  it('explains capture, the R270 cost and the break-even price', () => {
    const markup = renderToStaticMarkup(<SellLanding />);
    expect(markup).toContain('0% seller fee');
    expect(markup).toContain('R270');
    expect(markup).toContain('R2,700');
  });

  it('renders the claim-scope disclosure and a real start link', () => {
    const markup = renderToStaticMarkup(<SellLanding />);
    expect(markup).toContain(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
    expect(markup).toContain('href="/sign-in"');
  });
});

describe('legal pages', () => {
  it('/legal/privacy names the POPIA rights and links the request path', () => {
    const markup = renderToStaticMarkup(<LegalPrivacy route={route('/legal/privacy', 'Privacy')} />);
    expect(markup).toContain('Privacy notice (POPIA)');
    expect(markup).toContain('href="/account/data-request"');
    expect(markup).toContain(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
  });

  it('/legal/returns distinguishes the CPA rights from a universal cooling-off', () => {
    const markup = renderToStaticMarkup(<LegalReturns route={route('/legal/returns', 'Returns')} />);
    expect(markup).toContain('Returns policy');
    expect(markup).toContain('s.20');
    expect(markup).toContain('not automatically a seven-day');
  });

  it('/legal/terms states the completion trigger and links the fee policy', () => {
    const markup = renderToStaticMarkup(<LegalTerms route={route('/legal/terms', 'Terms')} />);
    expect(markup).toContain('Terms of sale');
    expect(markup).toContain('COMPLETED');
    expect(markup).toContain('href="/safety/policy/fees"');
  });

  it('/legal/humans describes roles without inventing people', () => {
    const markup = renderToStaticMarkup(<LegalHumans route={route('/legal/humans', 'Team')} />);
    expect(markup).toContain('The people behind the market');
    expect(markup).toContain('review queue');
    expect(markup).toContain('href="/account/data-request"');
  });

  it('/privacy-notice renders the same notice through its own route module', () => {
    const markup = renderToStaticMarkup(<PrivacyNoticeAlias route={route('/privacy-notice', 'Privacy')} />);
    expect(markup).toContain('Privacy notice (POPIA)');
    expect(markup).toContain('data-page="/privacy-notice"');
  });
});

describe('policy components stay usable on their own', () => {
  it('every legal component renders a section, not a second main landmark', () => {
    for (const Component of [PrivacyNotice, ReturnsPolicy, TermsOfSale, HumansPage]) {
      const markup = renderToStaticMarkup(<Component />);
      expect(markup.startsWith('<section')).toBe(true);
      expect(markup).not.toContain('<main');
    }
  });
});
