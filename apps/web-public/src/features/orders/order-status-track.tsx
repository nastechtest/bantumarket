import { raw, tokens } from '@nastech/design-tokens';
import { ladderView, LADDER_STAGES, STATE_LABELS } from './state-labels.js';
import type { OrderState } from './state-labels.js';

/**
 * The order ladder, drawn from `ladderView` only — the render layer performs no state logic.
 * Side states (cancelled / refund / dispute) are deliberately OFF the ladder: they are not a
 * rung the order walked to, they are where the order left it. Drawing them as rungs would
 * imply, e.g., that REFUND_PENDING is further along than HANDOVER_CONFIRMED. It is a departure.
 */

const sideCopy: Record<'cancelled' | 'refund' | 'dispute', string> = {
  cancelled: 'This order was cancelled before it could complete.',
  refund: 'This order left the ladder for a refund. Money only returns when the refund settles.',
  dispute: 'This order is on hold under review. The money is held and neither side can spend it.',
};

export function OrderStatusTrack({ state, role = 'buyer' }: { state: OrderState; role?: 'buyer' | 'seller' }) {
  const view = ladderView(state);
  const label = STATE_LABELS[state];
  return (
    <div data-testid="status-track" style={{ fontFamily: raw.type.familyText }}>
      <ol
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: raw.space.s2,
          listStyle: 'none',
          margin: 0,
          padding: 0,
          fontSize: '0.8125rem',
        }}
        aria-label="Order progress"
      >
        {LADDER_STAGES.map((stage, index) => {
          const rung = view.rung < 0 ? 'todo' : index < view.rung ? 'done' : index === view.rung ? 'current' : 'todo';
          return (
            <li
              key={stage.state}
              data-state={rung}
              {...(rung === 'current' ? { 'aria-current': 'step' as const } : {})}
              style={{
                padding: `${raw.space.s1} ${raw.space.s3}`,
                borderRadius: raw.radius.pill,
                border: `1px solid ${rung === 'current' ? tokens.action.default : raw.color.ink100}`,
                color: rung === 'todo' ? tokens.text.disabled : tokens.text.primary,
                fontWeight: rung === 'current' ? 600 : 400,
              }}
            >
              {rung === 'done' ? '✓ ' : ''}
              {stage.label}
            </li>
          );
        })}
      </ol>
      {view.side !== null ? (
        <p role="status" style={{ margin: `${raw.space.s3} 0 0`, color: raw.color.signalCaution, fontWeight: 600 }}>
          {label[role === 'buyer' ? 'buyer' : 'seller']} — {sideCopy[view.side]}
        </p>
      ) : (
        <p role="status" style={{ margin: `${raw.space.s3} 0 0`, color: tokens.text.secondary }}>
          {label.moneyNote}
        </p>
      )}
    </div>
  );
}
