import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { ReportSubject, ReportSubjectKind } from './api/safety-transport.js';
import { fixtureSubjects } from './api/fixtures.js';

/**
 * Lets any surface (item page, seller profile, order, handover screen) hand the report flow a
 * pre-filled subject, so the reporter never has to re-identify what they are looking at. The
 * context carries the subject; the flow still shows the picker with it selected — a silent
 * pre-fill that the person never sees is how wrong people get reported.
 */

export type { ReportSubject, ReportSubjectKind };

export const SUBJECT_KIND_LABELS: Readonly<Record<ReportSubjectKind, string>> = {
  item: 'A listing',
  seller: 'A seller',
  order: 'An order',
  handover: 'A scheduled handover',
};

/** Stable render order for the picker; matches the flow a person moves through. */
export const SUBJECT_KIND_ORDER: readonly ReportSubjectKind[] = ['item', 'seller', 'order', 'handover'];

export function describeSubject(subject: ReportSubject): string {
  return `${SUBJECT_KIND_LABELS[subject.kind]} — ${subject.label}`;
}

/**
 * Catalogue the picker offers when the person arrives with no pre-filled subject. Real transports
 * would query the reporter's recent surfaces; the fixture list stands in until the endpoints
 * exist (see CONTRACT-GAP in api/safety-transport.ts).
 */
export function defaultSubjectCatalogue(): readonly ReportSubject[] {
  return SUBJECT_KIND_ORDER.map((kind) => fixtureSubjects[kind]);
}

const FlagContext = createContext<ReportSubject | null>(null);

export interface FlagProviderProps {
  readonly subject: ReportSubject | null;
  readonly children: ReactNode;
}

export function FlagProvider({ subject, children }: FlagProviderProps) {
  return createElement(FlagContext.Provider, { value: subject }, children);
}

export function useFlagSubject(): ReportSubject | null {
  return useContext(FlagContext);
}

/**
 * Where a "Report" affordance on another surface should send the person. The controller owns
 * router.tsx; this is the path it needs registered.
 */
export const REPORT_FLOW_PATH = '/safety/report';
