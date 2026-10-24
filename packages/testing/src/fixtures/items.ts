import type { AssetManifest, ClaimScope, ListingSummary, Money, VerificationTier } from '@nastech/api-contracts';
import { money, TIER_LABELS } from '@nastech/api-contracts';
import { MANIFEST_SCENARIOS, makeManifest } from './asset-manifests.js';

/**
 * THE PARITY CORPUS.
 *
 * This is the list every app and package suite in the next wave is pointed at, so one bug reproduces
 * in two places instead of being discovered once per app. It is a corpus, not a fixture factory: the
 * names are the axes the product branches on, and the set is complete on each axis by construction
 * (`fixtures.test.ts` proves the completeness, which is the only way a corpus stays a corpus).
 *
 * The axes:
 *  - every `VerificationTier` in `TIER_LABELS` (T1…T5) — a badge that renders one tier renders all five;
 *  - every `ClaimScope` — geometry, condition-only, decorative;
 *  - items WITH and WITHOUT a 3D manifest, and among the ones with a manifest, every
 *    `MANIFEST_SCENARIOS` shape (poster-only, over-budget, LOD fallback, unreachable disclosure);
 *  - the three money edges: R0, the maximum listed price, and **exactly R270,00** — the per-item
 *    capture cost. At the 10 % take rate a seller must clear R2,700 for a capture to pay for itself,
 *    which is why the pilot category is watches; R270,00 is where "3D is not worth it" becomes a
 *    product statement rather than a vibe, and a UI that rounds or hides it is lying about the economics.
 *
 * Prices are SA display values in the brief's notation: `R0`, `R999 999,99`, `R270,00`. They are
 * carried as `Money` (integer cents) because that is what the ledger accepts.
 *
 * CONTRACT-GAP: `@nastech/api-contracts` publishes `ListingSummary` but no full `Listing`/`Item` wire
 * type yet (the PHP backend has no HTTP layer, ADR 0002), so `MarketItem` extends `ListingSummary`
 * with the fields every app is going to render anyway. When the contract grows the real type,
 * `MarketItem` should become that type and this file should stop declaring fields.
 */

export interface ConditionDisclosure {
  readonly id: string;
  readonly text: string;
  readonly severity: 'cosmetic' | 'functional' | 'unknown';
}

export interface MarketItem extends ListingSummary {
  readonly slug: string;
  readonly sellerId: string;
  readonly conditionDisclosures: readonly ConditionDisclosure[];
  /** Present exactly when `has3d` is true; a mismatch is a corpus bug and `fixtures.test.ts` checks it. */
  readonly manifest?: AssetManifest;
  readonly claimScope?: ClaimScope;
  readonly city: 'Cape Town' | 'Johannesburg' | 'Durban';
  readonly listedAt: string;
  /** Cents the capture programme spent on this item. R270,00 is the pilot's real number. */
  readonly captureCostCents: number;
}

export const MAX_LISTED_CENTS = 99_999_999;
export const ZERO_CENTS = 0;
export const CAPTURE_COST_CENTS = 27_000;
export const CAPTURE_VIABLE_CENTS = 270_000;

export const PRICE_EDGES: Readonly<Record<'zero' | 'captureCost' | 'viableThreshold' | 'maximum', Money>> = {
  zero: money(ZERO_CENTS),
  captureCost: money(CAPTURE_COST_CENTS),
  viableThreshold: money(CAPTURE_VIABLE_CENTS),
  maximum: money(MAX_LISTED_CENTS),
};

function base(overrides: Partial<MarketItem> & Pick<MarketItem, 'id' | 'title' | 'price' | 'sellerTier'>): MarketItem {
  const { manifest, claimScope, ...rest } = overrides;
  return {
    slug: overrides.id,
    sellerId: 'usr-seller-1',
    categorySlug: 'watches',
    posterUrl: `/posters/${overrides.id}.webp`,
    conditionDisclosures: [],
    city: 'Cape Town',
    listedAt: '2026-10-06T09:00:00+02:00',
    captureCostCents: 0,
    ...rest,
    has3d: manifest !== undefined,
    ...(manifest !== undefined
      ? { manifest, claimScope: manifest.claimScope }
      : claimScope !== undefined
        ? { claimScope }
        : {}),
  };
}

/** The R270,00 item: exactly the capture cost as the asking price. */
export const ITEM_AT_CAPTURE_COST: MarketItem = base({
  id: 'item-r270-exact',
  title: 'Casio F-91W — one week of use',
  price: money(CAPTURE_COST_CENTS),
  sellerTier: 'T1',
  conditionDisclosures: [
    { id: 'D-501', text: 'Strap shows creasing; resin case unmarked.', severity: 'cosmetic' },
  ],
});

export const ITEM_ZERO_PRICE: MarketItem = base({
  id: 'item-zero',
  title: 'Free to a good home: Seiko display stand',
  price: money(ZERO_CENTS),
  sellerTier: 'T1',
});

export const ITEM_MAX_PRICE: MarketItem = base({
  id: 'item-max',
  title: 'Omega Seamaster 300, 1998 service history',
  price: money(MAX_LISTED_CENTS),
  sellerTier: 'T4',
  conditionDisclosures: [
    { id: 'D-502', text: 'Serviced 2024; pressure test not repeated — not sold as water-resistant.', severity: 'functional' },
  ],
});

/** R2,700: the lowest price at which a capture pays for itself at the 10 % take rate. */
export const ITEM_AT_VIABLE_PRICE: MarketItem = base({
  id: 'item-viable',
  title: 'Seiko 5 SNK809, field condition',
  price: money(CAPTURE_VIABLE_CENTS),
  sellerTier: 'T3',
  manifest: MANIFEST_SCENARIOS.fullCapture!(),
  captureCostCents: CAPTURE_COST_CENTS,
  conditionDisclosures: [
    { id: 'D-118', text: MANIFEST_SCENARIOS.fullCapture!().captions[0]?.disclosureText ?? 'Hairline on the case flank.', severity: 'cosmetic' },
  ],
});

/** Items with no 3D at all: the static path is the whole product for these listings. */
export const ITEMS_WITHOUT_3D: readonly MarketItem[] = [
  ITEM_ZERO_PRICE,
  ITEM_AT_CAPTURE_COST,
  ITEM_MAX_PRICE,
  base({
    id: 'item-static-only',
    title: 'Swatch Irony, original buckle',
    price: money(1_450_00),
    sellerTier: 'T2',
    conditionDisclosures: [
      { id: 'D-304', text: 'Strap shows everyday wear; buckle springs fine.', severity: 'cosmetic' },
    ],
  }),
];

/** One item per manifest scenario, each carrying that scenario's manifest. */
export const ITEMS_WITH_3D: readonly MarketItem[] = Object.entries(MANIFEST_SCENARIOS).map(([name, build], index) => {
  const manifest = build();
  return base({
    id: `item-3d-${name}`,
    title: `${name} capture — pre-owned watch`,
    price: money(3_200_00 + index * 100_00),
    sellerTier: 'T4',
    slug: `3d-${name}`,
    manifest,
    // The capture cost is real for every captured item; the corpus keeps it visible rather than
    // assuming a UI will recompute it.
    captureCostCents: CAPTURE_COST_CENTS,
    conditionDisclosures: manifest.captions.map((caption) => ({
      id: caption.disclosureId,
      text: caption.disclosureText,
      severity: caption.severity,
    })),
  });
});

/** One item per tier, so a badge test can iterate `TIER_LABELS` rather than list five strings. */
export function itemsByTier(): Record<VerificationTier, MarketItem> {
  return (Object.keys(TIER_LABELS) as VerificationTier[]).reduce<Record<VerificationTier, MarketItem>>((acc, tier, index) => {
    acc[tier] = base({
      id: `item-tier-${tier}`,
      title: `${TIER_LABELS[tier]} listing ${index + 1}`,
      price: money(4_000_00 + index * 250_00),
      sellerTier: tier,
      slug: `tier-${tier}`,
    });
    return acc;
  }, {} as Record<VerificationTier, MarketItem>);
}

/** One item per claim scope, each with a manifest carrying exactly that scope. */
export function itemsByClaimScope(): Record<ClaimScope, MarketItem> {
  const scopes: readonly ClaimScope[] = ['geometry_and_external_condition', 'condition_only', 'none'];
  return scopes.reduce<Record<ClaimScope, MarketItem>>((acc, scope) => {
    const manifest = makeManifest({ assetId: `asset-${scope}`, listingId: `item-scope-${scope}`, claimScope: scope });
    acc[scope] = base({
      id: `item-scope-${scope}`,
      title: `Scope ${scope}`,
      price: money(6_500_00),
      sellerTier: 'T3',
      slug: `scope-${scope}`,
      manifest,
    });
    return acc;
  }, {} as Record<ClaimScope, MarketItem>);
}

/** The whole corpus, in one array — what an iterating suite wants. */
export const PARITY_CORPUS: readonly MarketItem[] = [
  ...ITEMS_WITHOUT_3D,
  ...ITEMS_WITH_3D,
  ITEM_AT_VIABLE_PRICE,
  ...Object.values(itemsByTier()),
  ...Object.values(itemsByClaimScope()),
];

export const CORPUS_BY_ID: Readonly<Record<string, MarketItem>> = Object.fromEntries(
  PARITY_CORPUS.map((item) => [item.id, item]),
);

export function itemById(id: string): MarketItem {
  const found = CORPUS_BY_ID[id];
  if (found === undefined) throw new Error(`testing/fixtures: no corpus item with id "${id}"`);
  return found;
}

/** Items whose `has3d` disagrees with the presence of a manifest — the corpus bug detector. */
export function inconsistentItems(): readonly MarketItem[] {
  return PARITY_CORPUS.filter((item) => item.has3d !== (item.manifest !== undefined));
}
