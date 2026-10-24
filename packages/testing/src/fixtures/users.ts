import type { VerificationTier } from '@nastech/api-contracts';

/**
 * User fixtures.
 *
 * There is no `User` wire type in `@nastech/api-contracts` yet — the PHP side has users but the HTTP
 * layer does not (ADR 0002) — so this shape is declared here and marked as a gap rather than invented
 * silently. It is deliberately the *display* surface a frontend needs: name, city, tier, and whether
 * the account can see another person's contact details. Nothing here is a phone number or an ID
 * number, because a frontend that receives them can leak them, and this corpus is what every app test
 * will render.
 *
 * CONTRACT-GAP: when `@nastech/api-contracts` grows a `User`/`Party` type, `TestUser` should become an
 * alias of it and this file should stop declaring fields.
 */

export type AccountRole = 'buyer' | 'seller' | 'both' | 'staff';

export interface TestUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: AccountRole;
  readonly verificationTier: VerificationTier;
  readonly city: 'Cape Town' | 'Johannesburg' | 'Durban';
  readonly memberSince: string;
  readonly completedSales: number;
  /** Contact handover is a post-payment right, not a profile field. */
  readonly contactVisible: boolean;
  readonly flaggedForFraudReview: boolean;
}

export const USERS: Readonly<Record<string, TestUser>> = {
  buyer: {
    id: 'usr-buyer-1',
    displayName: 'Thandi Mokoena',
    role: 'buyer',
    verificationTier: 'T2',
    city: 'Cape Town',
    memberSince: '2026-03-11',
    completedSales: 0,
    contactVisible: false,
    flaggedForFraudReview: false,
  },
  seller: {
    id: 'usr-seller-1',
    displayName: 'Ahomed Motors & Watches',
    role: 'seller',
    verificationTier: 'T4',
    city: 'Cape Town',
    memberSince: '2025-11-02',
    completedSales: 41,
    contactVisible: false,
    flaggedForFraudReview: false,
  },
  /** The common case in a user-to-user market: one account doing both, at the lower tier. */
  both: {
    id: 'usr-both-1',
    displayName: 'Lerato dis Two',
    role: 'both',
    verificationTier: 'T1',
    city: 'Durban',
    memberSince: '2026-08-19',
    completedSales: 2,
    contactVisible: false,
    flaggedForFraudReview: false,
  },
  staff: {
    id: 'usr-staff-1',
    displayName: 'NasTech staff (QC)',
    role: 'staff',
    verificationTier: 'T5',
    city: 'Cape Town',
    memberSince: '2025-06-01',
    completedSales: 0,
    contactVisible: true,
    flaggedForFraudReview: false,
  },
  /** The account every dispute and handover-lock test eventually needs: real, but under review. */
  underReview: {
    id: 'usr-seller-review',
    displayName: 'Kgotla Trading',
    role: 'seller',
    verificationTier: 'T2',
    city: 'Johannesburg',
    memberSince: '2026-09-30',
    completedSales: 6,
    contactVisible: false,
    flaggedForFraudReview: true,
  },
};

/** One user per tier, because tier is a *claim* and every claim needs a rendering test. */
export function usersByTier(): Record<VerificationTier, TestUser> {
  const tiers: readonly VerificationTier[] = ['T1', 'T2', 'T3', 'T4', 'T5'];
  return tiers.reduce<Record<VerificationTier, TestUser>>((acc, tier, index) => {
    acc[tier] = {
      ...USERS.seller!,
      id: `usr-tier-${tier}`,
      displayName: `Seller ${tier}`,
      verificationTier: tier,
      // Sales count varies per tier so a test cannot accidentally assert "41" as a tier property.
      completedSales: index * 7,
    };
    return acc;
  }, {} as Record<VerificationTier, TestUser>);
}
