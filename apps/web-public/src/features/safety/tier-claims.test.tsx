import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TIER_LABELS } from '@nastech/api-contracts';
import type { VerificationTier } from '@nastech/api-contracts';
import { TIER_CLAIMS, TIER_ORDER, TierExplainer } from './trust/tier-explainer.js';
import { NOT_A_TIER_RULES, WhatTierIsNot } from './trust/what-tier-is-not.js';
import { ReviewRecordPanel } from './trust/review-record.js';
import { createFixtureTransport } from './api/fixtures.js';

/**
 * What each tier surface is allowed to claim — asserted as behaviour, not vibes: a reviewer can
 * ask "what exactly does this say?" of any tier in the tree and this file answers with strings.
 */

const ALL_TIERS: readonly VerificationTier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];

describe('tier vocabulary', () => {
  it('covers exactly the five contract tiers, once each, labels taken from TIER_LABELS', () => {
    expect([...TIER_ORDER].sort()).toEqual([...ALL_TIERS].sort());
    expect(TIER_CLAIMS).toHaveLength(TIER_ORDER.length);
    for (const claim of TIER_CLAIMS) {
      expect(claim.label).toBe(TIER_LABELS[claim.tier]);
    }
  });

  it('every tier ships its negative disclosure — a claim without a “what it is not” is a badge', () => {
    for (const claim of TIER_CLAIMS) {
      expect(claim.doesNotMean.length).toBeGreaterThan(20);
      expect(claim.whoChecked.length).toBeGreaterThan(5);
    }
  });

  it('renders all five labels and all five negatives, each inside its tier block', () => {
    const markup = renderToStaticMarkup(<TierExplainer />);
    for (const claim of TIER_CLAIMS) {
      expect(markup).toContain(claim.label);
      expect(markup).toContain(claim.doesNotMean);
      expect(markup).toContain(claim.whoChecked);
      expect(markup).toContain(`data-tier="${claim.tier}"`);
    }
    // The negative line is a labelled row, not an afterthought: every tier block renders it.
    expect(markup.split('What it is not:').length - 1).toBe(TIER_CLAIMS.length);
  });

  it('T5 is described as a money location, never as a quality judgement', () => {
    const t5 = TIER_CLAIMS.find((c) => c.tier === 'T5')!;
    expect(t5.means).toContain('held on our side');
    expect(t5.doesNotMean).toContain('nothing about the item');
  });
});

describe('what-tier-is-not', () => {
  it('renders every rule of the anti-affordance list', () => {
    const markup = renderToStaticMarkup(<WhatTierIsNot />);
    for (const rule of NOT_A_TIER_RULES) {
      expect(markup).toContain(rule.rule);
      expect(markup).toContain(rule.why);
    }
    expect(NOT_A_TIER_RULES.length).toBeGreaterThanOrEqual(5);
  });

  it('states the ranking denial in the first rule, in words a 11pm reader repeats correctly', () => {
    expect(NOT_A_TIER_RULES[0]!.rule).toContain('not a ranking of people');
  });
});

describe('review record', () => {
  const transport = createFixtureTransport();

  it('shows the action, the actor and the non-coverage for every fixture entry', async () => {
    const record = await transport.fetchReviewRecord('lst_01');
    const markup = renderToStaticMarkup(<ReviewRecordPanel record={record} />);
    for (const entry of record.entries) {
      expect(markup).toContain(TIER_LABELS[entry.tier]);
      expect(markup).toContain(entry.action);
      expect(markup).toContain(entry.performedByRole);
      expect(markup).toContain('Did not cover:');
    }
  });

  it('the T4 fixture entry admits, in its own words, that no watchmaking happened', async () => {
    const record = await transport.fetchReviewRecord('lst_01');
    const t4 = record.entries.find((e) => e.tier === 'T4')!;
    expect(t4.notCovered).toContain('horologist');
    expect(t4.notCovered).toContain('water resistance');
  });

  it('every transport review entry carries a non-coverage line — the shape is mandatory', async () => {
    const record = await transport.fetchReviewRecord('lst_01');
    for (const entry of record.entries) {
      expect(entry.notCovered.trim().length).toBeGreaterThan(10);
    }
  });
});
