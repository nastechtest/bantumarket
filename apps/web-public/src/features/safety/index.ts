import { createElement, type ReactNode } from 'react';
import type { RouteDef } from '../../router.js';
import { FlagProvider } from './flag-context.js';
import { fixtureTransport } from './api/fixtures.js';
import { SafetyHub } from './safety-hub.js';
import { HowItWorks } from './how-it-works.js';
import { MeetSafely } from './meet-safely.js';
import { ScamPatterns } from './scam-patterns.js';
import { ReportFlow } from './report-flow/index.js';
import { TierExplainer } from './trust/tier-explainer.js';
import { WhatTierIsNot } from './trust/what-tier-is-not.js';
import { ReviewRecord } from './trust/review-record.js';
import { BlockList } from './blocking/block-list.js';
import { FeesPolicy } from './policy/fees.js';
import { ProhibitedPolicy } from './policy/prohibited.js';
import { PopiaNote } from './policy/popia-note.js';
import { ChildrenPolicy } from './policy/children.js';

/**
 * One Page for the whole feature: the controller owns router.tsx and adds route rows; every path
 * below is the list to add, all inside the `first-paint` budget class — these are read pages for
 * nervous people, and none of them may reach the scene runtime.
 *
 * `createElement` instead of JSX because the wave convention names this file index.ts.
 */

function trustPage(): ReactNode {
  return createElement(
    'div',
    null,
    createElement(TierExplainer),
    createElement(WhatTierIsNot),
    createElement('h2', { style: { marginTop: '2rem', fontSize: '1.2rem' } }, 'Example review record'),
    createElement(ReviewRecord, { transport: fixtureTransport, listingId: 'lst_01' }),
  );
}

function reportPage(): ReactNode {
  // The standalone route has no pre-filled subject; other surfaces render ReportFlow inside a
  // FlagProvider with the listing/seller/order they are standing on.
  return createElement(FlagProvider, { subject: null, children: createElement(ReportFlow, { transport: fixtureTransport }) });
}

export const SAFETY_SECTIONS: readonly { readonly path: string; readonly render: () => ReactNode }[] = [
  { path: '/safety', render: () => createElement(SafetyHub) },
  { path: '/safety/how-it-works', render: () => createElement(HowItWorks) },
  { path: '/safety/meet-safely', render: () => createElement(MeetSafely) },
  { path: '/safety/scam-patterns', render: () => createElement(ScamPatterns) },
  { path: '/safety/report', render: () => reportPage() },
  { path: '/safety/trust', render: () => trustPage() },
  { path: '/safety/blocking', render: () => createElement(BlockList, { transport: fixtureTransport }) },
  { path: '/safety/policy/fees', render: () => createElement(FeesPolicy) },
  { path: '/safety/policy/prohibited', render: () => createElement(ProhibitedPolicy) },
  { path: '/safety/policy/popia', render: () => createElement(PopiaNote) },
  { path: '/safety/policy/children', render: () => createElement(ChildrenPolicy) },
];

export function safetySectionForPath(path: string) {
  const match = SAFETY_SECTIONS.find((s) => s.path === path);
  return match ?? SAFETY_SECTIONS[0]!;
}

export default function SafetyPage({ route }: { route: RouteDef }) {
  const section = safetySectionForPath(route.path);
  return createElement('div', { className: 'safety-feature' }, section.render());
}

export { SafetyHub } from './safety-hub.js';
export { HowItWorks } from './how-it-works.js';
export { MeetSafely, CAPE_TOWN_SPOTS, OTHER_CITY_SPOTS, MEETING_RULES } from './meet-safely.js';
export { ScamPatterns, SCAM_PATTERNS } from './scam-patterns.js';
export { TIER_ORDER, TIER_CLAIMS, TierExplainer, type TierClaim } from './trust/tier-explainer.js';
export { WhatTierIsNot, NOT_A_TIER_RULES } from './trust/what-tier-is-not.js';
export { ReviewRecord, ReviewRecordPanel } from './trust/review-record.js';
export { ReportFlow, ReportReceipt } from './report-flow/index.js';
export { SubjectPicker } from './report-flow/subject-picker.js';
export { ReasonPicker, REPORT_REASONS, reasonById } from './report-flow/reason.js';
export { EvidenceStep } from './report-flow/evidence.js';
export { WhatHappensNext, OUTCOME_RANGE } from './report-flow/what-happens-next.js';
export { MuteSellerButton, type SellerRef } from './blocking/mute-seller.js';
export { BlockList } from './blocking/block-list.js';
export { FeesPolicy } from './policy/fees.js';
export { ProhibitedPolicy, PROHIBITED } from './policy/prohibited.js';
export { PopiaNote, POPIA_FACTS } from './policy/popia-note.js';
export { ChildrenPolicy } from './policy/children.js';
export {
  FlagProvider,
  useFlagSubject,
  describeSubject,
  defaultSubjectCatalogue,
  SUBJECT_KIND_LABELS,
  SUBJECT_KIND_ORDER,
  REPORT_FLOW_PATH,
  type ReportSubject,
  type ReportSubjectKind,
} from './flag-context.js';
export {
  REPORT_QUEUE,
  FEE_TERMS,
  type ReportAck,
  type ReportEvidence,
  type ReportInput,
  type ReviewRecord as ReviewRecordData,
  type MutedSeller,
  type SafetyTransport,
} from './api/safety-transport.js';
export { createFixtureTransport, fixtureTransport, fixtureSubjects, fixtureSaleExample } from './api/fixtures.js';
export {
  validateReport,
  draftToInput,
  submitReport,
  emptyDraft,
  REPORT_STEPS,
  MIN_NARRATIVE_CHARS,
  type ReportDraft,
  type ReportStep,
} from './report-flow/submit.js';
export {
  useReport,
  reportReducer,
  initialReportState,
  stepErrors,
  currentStep,
  type ReportState,
  type ReportAction,
} from './report-flow/use-report.js';
