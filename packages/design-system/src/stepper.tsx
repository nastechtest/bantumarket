import { raw, tokens } from '@nastech/design-tokens';

export interface Step {
  readonly label: string;
}

/**
 * Checkout, handover and dispute all walk a flow; a screen-reader user must be able to ask
 * "where am I" without reading the styling. `aria-current="step"` is the announcement; the
 * `data-state` pair is what the visual treatment keys off, so the semantics never depend on
 * colour alone.
 */
export function Stepper({ steps, currentIndex }: { steps: readonly Step[]; currentIndex: number }) {
  return (
    <ol
      className="ds-stepper"
      style={{
        display: 'flex',
        gap: raw.space.s3,
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
              color: state === 'todo' ? tokens.text.disabled : tokens.text.primary,
              fontWeight: state === 'current' ? 600 : 400,
            }}
          >
            {index + 1}. {step.label}
            {state === 'done' ? ' ✓' : ''}
          </li>
        );
      })}
    </ol>
  );
}
