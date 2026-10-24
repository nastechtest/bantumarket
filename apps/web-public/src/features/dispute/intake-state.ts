/**
 * The intake form's state, as a reducer — the half of the dispute screen that needs no browser.
 *
 * Split out of `use-dispute.ts` because it is pure data transition and the hook is effects: the two
 * change for different reasons, and a test of "does picking a reason pre-select a severity" should not
 * have to mount a component. Same argument for every module beside this one.
 *
 * One rule the reducer keeps and the UI cannot override: `restore_draft` never overwrites an answer the
 * buyer has already given on this page. A draft is a fallback, and a fallback that wins silently
 * replaces what a person just typed with something from three days ago.
 */
import type { DisputeSeverity } from './api/dispute-transport.js';
import type { DisputeDraft } from './draft-persistence.js';
import type { UploadState } from './intake/upload-machine.js';
import { suggestedSeverityForCode } from './intake/severity.js';

export type IntakeStep = 'reason' | 'evidence' | 'review';

export interface IntakeState {
  readonly step: IntakeStep;
  readonly reasonCode: string | null;
  readonly severity: DisputeSeverity | null;
  readonly statement: string;
  /** `localId` → the upload machine's state for that file. */
  readonly uploads: Readonly<Record<string, UploadState>>;
  readonly readRightsAcknowledged: boolean;
  /** Set when a draft was found on this device; the buyer decides whether to take it back. */
  readonly draftFoundAt: string | null;
}

export type IntakeAction =
  | { readonly type: 'step'; readonly step: IntakeStep }
  | { readonly type: 'reason'; readonly code: string }
  | { readonly type: 'severity'; readonly value: DisputeSeverity }
  | { readonly type: 'statement'; readonly value: string }
  | { readonly type: 'upload'; readonly localId: string; readonly state: UploadState }
  | { readonly type: 'upload_removed'; readonly localId: string }
  | { readonly type: 'acknowledge'; readonly value: boolean }
  | { readonly type: 'restore_draft'; readonly draft: DisputeDraft; readonly adoptStep: boolean }
  | { readonly type: 'draft_found'; readonly savedAt: string }
  | { readonly type: 'draft_dismissed' }
  | { readonly type: 'reset' };

export function initialIntakeState(): IntakeState {
  return {
    step: 'reason',
    reasonCode: null,
    severity: null,
    statement: '',
    uploads: {},
    readRightsAcknowledged: false,
    draftFoundAt: null,
  };
}

export function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case 'step':
      return { ...state, step: action.step };
    case 'reason':
      // Pre-select the severity the reason implies, and never leave a stale one pinned from the
      // previous reason: the buyer can change it either way.
      return { ...state, reasonCode: action.code, severity: suggestedSeverityForCode(action.code) };
    case 'severity':
      return { ...state, severity: action.value };
    case 'statement':
      return { ...state, statement: action.value };
    case 'upload':
      return { ...state, uploads: { ...state.uploads, [action.localId]: action.state } };
    case 'upload_removed': {
      const next = { ...state.uploads };
      delete next[action.localId];
      return { ...state, uploads: next };
    }
    case 'acknowledge':
      return { ...state, readRightsAcknowledged: action.value };
    case 'restore_draft':
      return {
        ...state,
        reasonCode: state.reasonCode ?? action.draft.reasonCode,
        severity: state.severity ?? action.draft.severity,
        statement: action.draft.statement,
        readRightsAcknowledged: action.draft.readRightsAcknowledged,
        step: action.adoptStep ? action.draft.step : state.step,
        draftFoundAt: null,
      };
    case 'draft_found':
      return { ...state, draftFoundAt: action.savedAt };
    case 'draft_dismissed':
      return { ...state, draftFoundAt: null };
    case 'reset':
      return initialIntakeState();
    default:
      return state;
  }
}
