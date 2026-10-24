import type { StaffRole } from './role.js';

/**
 * Capabilities are strings the server understands. The seven core ones are fixed by brief 34;
 * the rest exist because a screen with no capability would have to check a role name, which is
 * exactly the failure mode this module exists to prevent.
 */
export const CORE_CAPABILITIES = [
  'listing.review',
  'listing.takedown',
  'dispute.decide',
  'payout.retry',
  'account.sanction',
  'data.export',
  'impersonate',
] as const;

export const EXTENDED_CAPABILITIES = [
  'queue.view',
  'dispute.view',
  'risk.view',
  'risk.act',
  'finance.view',
  'finance.export',
  'payout.view',
  'payout.prepare',
  'payout.release',
  'capture.view',
  'capture.act',
  'qc.pass',
  'catalogue.manage',
  'account.view',
  'audit.view',
  'audit.export',
  'popia.view',
  'popia.manage',
] as const;

export const CAPABILITIES = [...CORE_CAPABILITIES, ...EXTENDED_CAPABILITIES] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface CapabilityGrant {
  readonly capability: Capability;
  /** Optional server scope, e.g. a city. Absent means global. */
  readonly scope?: string;
}

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && CAPABILITY_SET.has(value);
}

/** Filters a server payload without trusting it: unknown strings are dropped, not coerced. */
export function normaliseGrants(values: readonly unknown[]): readonly CapabilityGrant[] {
  const seen = new Set<Capability>();
  const out: CapabilityGrant[] = [];
  for (const value of values) {
    if (!isCapability(value) || seen.has(value)) continue;
    seen.add(value);
    out.push({ capability: value });
  }
  return out;
}

const ROLE_BASELINE: Readonly<Record<StaffRole, readonly Capability[]>> = {
  reviewer: ['queue.view', 'listing.review'],
  resolver: ['dispute.view', 'dispute.decide'],
  risk_analyst: ['risk.view', 'risk.act'],
  finance_maker: ['finance.view', 'finance.export', 'payout.view', 'payout.prepare', 'payout.retry'],
  finance_checker: ['finance.view', 'payout.view', 'payout.release'],
  capture_operator: ['capture.view', 'capture.act'],
  qc_reviewer: ['capture.view', 'qc.pass'],
  catalogue_admin: ['catalogue.manage'],
  privacy_officer: ['popia.view', 'popia.manage', 'data.export'],
  auditor: ['audit.view', 'audit.export', 'finance.view', 'dispute.view'],
  admin: [
    'queue.view',
    'listing.review',
    'listing.takedown',
    'dispute.view',
    'dispute.decide',
    'risk.view',
    'risk.act',
    'finance.view',
    'finance.export',
    'payout.view',
    'payout.prepare',
    'payout.release',
    'payout.retry',
    'capture.view',
    'capture.act',
    'qc.pass',
    'catalogue.manage',
    'account.view',
    'account.sanction',
    'audit.view',
    'audit.export',
    'popia.view',
    'popia.manage',
    'data.export',
    'impersonate',
  ],
};

/**
 * Baseline used to build fixtures and to explain a role. It is never the answer to "may this
 * person do it" — the session's server-issued capability list is.
 */
export function roleBaseline(role: StaffRole): readonly Capability[] {
  return ROLE_BASELINE[role];
}

export function capabilityDescription(capability: Capability): string {
  switch (capability) {
    case 'listing.review':
      return 'Review a listing and record a decision';
    case 'listing.takedown':
      return 'Take a listing down from the marketplace';
    case 'dispute.decide':
      return 'Decide a dispute and move money';
    case 'payout.retry':
      return 'Retry a payout that failed';
    case 'account.sanction':
      return 'Limit or suspend an account';
    case 'data.export':
      return 'Export personal data from the console';
    case 'impersonate':
      return 'Operate as another account for support';
    default:
      return `Open ${capability.replace('.', ' ')}`;
  }
}

const ROLE_TO_ASK: Readonly<Record<Capability, string>> = {
  'listing.review': 'Listing reviewer',
  'listing.takedown': 'Console administrator',
  'dispute.decide': 'Dispute resolver',
  'payout.retry': 'Finance preparer',
  'account.sanction': 'Risk analyst',
  'data.export': 'Privacy officer',
  impersonate: 'Console administrator',
  'queue.view': 'Listing reviewer',
  'dispute.view': 'Dispute resolver',
  'risk.view': 'Risk analyst',
  'risk.act': 'Risk analyst',
  'finance.view': 'Finance checker',
  'finance.export': 'Finance preparer',
  'payout.view': 'Finance checker',
  'payout.prepare': 'Finance preparer',
  'payout.release': 'Finance checker',
  'capture.view': 'Capture operator',
  'capture.act': 'Capture operator',
  'qc.pass': 'QC reviewer',
  'catalogue.manage': 'Catalogue administrator',
  'account.view': 'Risk analyst',
  'audit.view': 'Auditor',
  'audit.export': 'Auditor',
  'popia.view': 'Privacy officer',
  'popia.manage': 'Privacy officer',
};

export function roleToAsk(capability: Capability): string {
  return ROLE_TO_ASK[capability];
}

export const IMPERSONATION_FORBIDDEN_CAPABILITIES: readonly Capability[] = ['payout.retry', 'account.sanction'];

export const IMPERSONATION_BLOCKED_PATHS: readonly string[] = ['/payouts', '/reconciliation', '/audit'];

export function isImpersonationBlockedPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? pathname;
  return IMPERSONATION_BLOCKED_PATHS.some((blocked) => path === blocked || path.startsWith(`${blocked}/`));
}

const ROUTE_CAPABILITY: ReadonlyArray<readonly [string, Capability]> = [
  ['/sign-in', 'queue.view'],
  ['/', 'queue.view'],
  ['/listings/:id/capture', 'qc.pass'],
  ['/listings/:id', 'listing.review'],
  ['/disputes/:id', 'dispute.view'],
  ['/disputes', 'dispute.view'],
  ['/risk/:caseId', 'risk.view'],
  ['/risk', 'risk.view'],
  ['/reconciliation', 'finance.view'],
  ['/payouts', 'payout.view'],
  ['/capture-ops', 'capture.view'],
  ['/taxonomy', 'catalogue.manage'],
  ['/users', 'account.view'],
  ['/audit', 'audit.view'],
  ['/requests', 'popia.view'],
];

function matches(pattern: string, pathname: string): boolean {
  const p = pattern.split('/');
  const a = pathname.split('/');
  if (p.length !== a.length) return false;
  return p.every((segment, index) => segment.startsWith(':') || segment === a[index]);
}

export function capabilityForPath(pathname: string): Capability | null {
  const path = pathname.split(/[?#]/)[0] ?? pathname;
  const exact = ROUTE_CAPABILITY.find(([pattern]) => pattern === path);
  if (exact) return exact[1];
  const parameterised = ROUTE_CAPABILITY.find(([pattern]) => pattern.includes(':') && matches(pattern, path));
  return parameterised ? parameterised[1] : null;
}

export type PathRefusalCode = 'ok' | 'no_session' | 'no_capability' | 'impersonation_blocked' | 'unknown_route';

export interface PathDecision {
  readonly allowed: boolean;
  readonly capability: Capability | null;
  readonly code: PathRefusalCode;
  /** Safe to render: names the missing capability, never a record. */
  readonly reason: string | null;
}

export interface CapabilitySubject {
  readonly capabilities: readonly Capability[];
  readonly impersonation: { readonly targetLabel: string } | null;
}

export function decidePath(subject: CapabilitySubject | null, pathname: string): PathDecision {
  if (subject === null) {
    return { allowed: false, capability: null, code: 'no_session', reason: 'Sign in to use the console.' };
  }
  const capability = capabilityForPath(pathname);
  if (capability === null) {
    return { allowed: false, capability: null, code: 'unknown_route', reason: 'This screen is not part of the console.' };
  }
  if (subject.impersonation !== null && isImpersonationBlockedPath(pathname)) {
    return {
      allowed: false,
      capability,
      code: 'impersonation_blocked',
      reason: `Impersonating ${subject.impersonation.targetLabel} cannot open this screen.`,
    };
  }
  if (!subject.capabilities.includes(capability)) {
    return {
      allowed: false,
      capability,
      code: 'no_capability',
      reason: 'Your role does not include this.',
    };
  }
  return { allowed: true, capability, code: 'ok', reason: null };
}
