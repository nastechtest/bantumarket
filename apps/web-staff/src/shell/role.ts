/**
 * Staff roles are a naming convenience for the operator, never the authorisation mechanism.
 * The server grants capabilities; `permissions.ts` checks the grant. A role string is useful for
 * display and for the "ask this role" sentence on a permission-denied screen.
 */

export const STAFF_ROLES = [
  'reviewer',
  'resolver',
  'risk_analyst',
  'finance_maker',
  'finance_checker',
  'capture_operator',
  'qc_reviewer',
  'catalogue_admin',
  'privacy_officer',
  'auditor',
  'admin',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

const ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  reviewer: 'Listing reviewer',
  resolver: 'Dispute resolver',
  risk_analyst: 'Risk analyst',
  finance_maker: 'Finance preparer',
  finance_checker: 'Finance checker',
  capture_operator: 'Capture operator',
  qc_reviewer: 'QC reviewer',
  catalogue_admin: 'Catalogue administrator',
  privacy_officer: 'Privacy officer',
  auditor: 'Auditor',
  admin: 'Console administrator',
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

export function roleLabel(role: StaffRole): string {
  return ROLE_LABELS[role];
}
