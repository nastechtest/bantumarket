/**
 * Frame indicator for the turntable. Rendered as text plus dots: the dots are the affordance, the
 * live text ("Frame 3 of 12") is what a screen reader and the no-3D CI pass assert on — an
 * indicator that only speaks in 12 CSS classes is decoration, not information.
 */

import { TURNTABLE_FRAME_COUNT } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';

export interface FrameIndicatorProps {
  readonly frame: number;
  readonly frames?: number;
  readonly onSelect: (frame: number) => void;
}

export function FrameIndicator({ frame, frames = TURNTABLE_FRAME_COUNT, onSelect }: FrameIndicatorProps) {
  const active = Math.min(Math.max(Math.round(frame), 0), frames - 1);
  return (
    <div
      className="item-turntable__indicator"
      data-active-frame={active}
      style={{ display: 'flex', alignItems: 'center', gap: raw.space.s3, fontFamily: raw.type.familyText }}
    >
      <ol
        role="group"
        aria-label={`Turntable frame ${active + 1} of ${frames}`}
        style={{ display: 'flex', gap: raw.space.s1, margin: 0, padding: 0, listStyle: 'none' }}
      >
        {Array.from({ length: frames }, (_, i) => (
          <li key={i}>
            <button
              type="button"
              aria-label={`Frame ${i + 1} of ${frames}`}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => onSelect(i)}
              style={{
                width: 10,
                height: 10,
                padding: 0,
                borderRadius: raw.radius.pill,
                border: `1px solid ${i === active ? tokens.action.default : raw.color.ink300}`,
                background: i === active ? tokens.action.default : tokens.surface.primary,
                cursor: 'pointer',
              }}
            />
          </li>
        ))}
      </ol>
      <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
        Frame {active + 1} of {frames}
      </span>
    </div>
  );
}
