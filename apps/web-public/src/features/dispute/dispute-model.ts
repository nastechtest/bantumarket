/**
 * What the dispute screen knows from the service, and the view state derived from it.
 *
 * `DisputeModel` is deliberately dumb — no formatted dates, no derived copy — because every one of
 * those would be a second source of truth about a case whose status only the service owns. `derivePhase`
 * is where the routing decision is made, exported and pure so it can be tested without a browser.
 *
 * Two cases in `derivePhase` are the ones that used to be where bugs lived, so they stay in this order:
 *  · `already_open` goes to tracking rather than showing a second intake form for a case that exists;
 *  · `send_unconfirmed` outranks the intake rather than pretending the send worked.
 * The clock is never the browser's: `derivePhase` takes the model and does not call `Date.now()`.
 */
import type { DisputeDto, DisputeFailure, OrderSnapshotDto } from './api/dispute-transport.js';
import type { EligibilityVerdict } from './eligibility.js';

/** Everything the screen knows from the service. */
export interface DisputeModel {
  readonly loading: boolean;
  readonly needsSignIn: boolean;
  readonly failure: DisputeFailure | null;
  readonly snapshot: OrderSnapshotDto | null;
  readonly verdict: EligibilityVerdict | null;
  readonly dispute: DisputeDto | null;
  readonly sendUnconfirmed: DisputeFailure | null;
  readonly notice: string | null;
}

export type ModelAction =
  | { readonly type: 'loading' }
  | { readonly type: 'needs_sign_in' }
  | { readonly type: 'read_failed'; readonly failure: DisputeFailure }
  | { readonly type: 'loaded'; readonly snapshot: OrderSnapshotDto; readonly verdict: EligibilityVerdict; readonly dispute: DisputeDto | null }
  | { readonly type: 'sent'; readonly dispute: DisputeDto }
  | { readonly type: 'send_unconfirmed'; readonly failure: DisputeFailure }
  | { readonly type: 'dispute_updated'; readonly dispute: DisputeDto }
  | { readonly type: 'notice'; readonly message: string | null }
  | { readonly type: 'settled' };

export const initialModel: DisputeModel = {
  loading: true,
  needsSignIn: false,
  failure: null,
  snapshot: null,
  verdict: null,
  dispute: null,
  sendUnconfirmed: null,
  notice: null,
};

export function modelReducer(state: DisputeModel, action: ModelAction): DisputeModel {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, failure: null };
    case 'needs_sign_in':
      // A signed-out visitor gets no snapshot, so nothing from a previous read may stay on screen:
      // the buyer would otherwise be looking at someone else's order state after a session expiry.
      return { ...initialModel, loading: false, needsSignIn: true };
    case 'read_failed':
      return { ...state, loading: false, failure: action.failure };
    case 'loaded':
      return {
        ...state,
        loading: false,
        needsSignIn: false,
        failure: null,
        snapshot: action.snapshot,
        verdict: action.verdict,
        dispute: action.dispute,
      };
    case 'sent':
      return { ...state, loading: false, dispute: action.dispute, sendUnconfirmed: null };
    case 'send_unconfirmed':
      return { ...state, loading: false, sendUnconfirmed: action.failure };
    case 'dispute_updated':
      return { ...state, dispute: action.dispute, sendUnconfirmed: null };
    case 'notice':
      return { ...state, notice: action.message };
    case 'settled':
      return { ...state, loading: false };
    default:
      return state;
  }
}

/** The view state, derived. */
export type PagePhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'needs_sign_in' }
  | { readonly kind: 'read_failed'; readonly failure: DisputeFailure }
  | { readonly kind: 'ineligible'; readonly verdict: EligibilityVerdict; readonly sendUnconfirmed: DisputeFailure | null }
  | { readonly kind: 'intake'; readonly snapshot: OrderSnapshotDto; readonly verdict: EligibilityVerdict; readonly sendUnconfirmed: DisputeFailure | null }
  | { readonly kind: 'tracking'; readonly snapshot: OrderSnapshotDto; readonly dispute: DisputeDto };

export function derivePhase(model: DisputeModel): PagePhase {
  if (model.needsSignIn) return { kind: 'needs_sign_in' };
  if (model.dispute !== null && model.snapshot !== null) {
    return { kind: 'tracking', snapshot: model.snapshot, dispute: model.dispute };
  }
  if (model.failure !== null) return { kind: 'read_failed', failure: model.failure };
  if (model.loading || model.snapshot === null || model.verdict === null) return { kind: 'loading' };
  const base = { sendUnconfirmed: model.sendUnconfirmed } as const;
  if (!model.verdict.canOpen) return { kind: 'ineligible', verdict: model.verdict, ...base };
  return { kind: 'intake', snapshot: model.snapshot, verdict: model.verdict, ...base };
}
