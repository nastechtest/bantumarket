import { raw, tokens } from '@nastech/design-tokens';

export interface FlowStep {
  readonly label: string;
  /** Optional one-line status shown under the label (e.g. "Awaiting payment"). */
  readonly detail?: string;
}

export interface StepIndicatorProps {
  steps: readonly FlowStep[];
  currentIndex: number;
  /** Horizontal is the default; vertical serves the dispute page's dense side rail. */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * The longer sibling of the committed `Stepper`: flows with per-step status text (capture jobs,
 * dispute lanes) need the detail line and a reading order that survives wrapping. Same contract:
 * `aria-current="step"` exactly once, `data-state` for the visual, and the done/todo difference
 * carried by text glyphs — never colour alone.
 */
export function StepIndicator({ steps, currentIndex, orientation = 'horizontal' }: StepIndicatorProps) {
  return (
    <ol
      className="ds-step-indicator"
      data-orientation={orientation}
      style={{
        display: 'flex',
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
        flexWrap: orientation === 'horizontal' ? 'wrap' : undefined,
        gap: raw.space.s4,
        listStyle: 'none',
        margin: 0,
        padding: 0,
        fontFamily: raw.type.familyText,
        fontSize: '0.875rem',
      }}
    >
      {steps.map((step, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
        return (
          <li
            key={step.label}
            data-state={state}
            {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}
            style={{
              display: 'flex',
              gap: raw.space.s2,
              color: state === 'todo' ? tokens.text.disabled : tokens.text.primary,
            }}
          >
            <span aria-hidden="true" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: state === 'current' ? 600 : 400 }}>
              {state === 'done' ? '✓' : index + 1}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1 }}>
              <span style={{ fontWeight: state === 'current' ? 600 : 400 }}>{step.label}</span>
              {step.detail ? (
                <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem' }}>{step.detail}</span>
              ) : null}
              {/* Announce the state in words; `✓` and position are not guaranteed to read. */}
              <span className="ds-visually-note" style={{ position: 'absolute', width: raw.space.s1, height: raw.space.s1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
                {state === 'done' ? '(completed)' : state === 'current' ? '(current step)' : '(not reached)'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
