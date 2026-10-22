import { useState, type KeyboardEvent } from 'react';
import { CLAIM_SCOPE_DISCLOSURE, type AssetManifest, type ConditionCaption } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import { markerCss, severityStyles } from './severity-styles.js';
import type { Projection } from './caption-projector.js';

/**
 * Condition callout (brief 03, module 1).
 *
 * The rule this component enforces in code: a callout points at a disclosure record and is not
 * itself evidence. So (a) a caption without a `disclosureId` renders NOTHING — not a dimmed dot,
 * not a "details pending" placeholder, nothing; and (b) everything this component composes
 * locally is pointer-and-quote language plus the contract's own claim-scope sentence. It never
 * asserts a condition claim in its own voice, because the dispute process reads the record, and
 * an overlay that sounds like evidence is exactly how rule 2 dies.
 */

/** The wire type says the id is required; runtime manifests are not the type. Whitespace is absence. */
export function hasDisclosureRef(caption: ConditionCaption): boolean {
  return typeof caption.disclosureId === 'string' && caption.disclosureId.trim().length > 0;
}

function panelIdFor(hotspotId: string): string {
  return `nt-disclosure-${hotspotId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export interface ConditionCalloutProps {
  readonly caption: ConditionCaption;
  readonly projection: Projection;
  /** Every callout quotes the contract sentence for the manifest's scope — never typed locally. */
  readonly claimScope: AssetManifest['claimScope'];
  /** Controlled from OverlayRoot (one open at a time); uncontrolled when omitted. */
  readonly open?: boolean;
  readonly onToggle?: () => void;
}

export function ConditionCallout({ caption, projection, claimScope, open, onToggle }: ConditionCalloutProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  if (!hasDisclosureRef(caption)) return null;

  const isOpen = open ?? ownOpen;
  const toggle = () => (onToggle ? onToggle() : setOwnOpen((v) => !v));
  const severity = severityStyles[caption.severity];
  const panelId = panelIdFor(caption.hotspotId);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isOpen && event.key === 'Escape') {
      event.stopPropagation();
      toggle();
    }
  };

  return (
    <div
      className="nt-callout"
      onKeyDown={onKeyDown}
      style={{ position: 'absolute', left: projection.xPx, top: projection.yPx, pointerEvents: 'auto', zIndex: isOpen ? 3 : 2 }}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`${severity.label} — disclosure ${caption.disclosureId.trim()} (item ${caption.hotspotId})`}
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.layout.gutter,
          padding: `${raw.space.s1} ${raw.space.s2}`,
          background: tokens.surface.inverse,
          color: tokens.text.onInverse,
          border: `1px solid ${severity.hex}`,
          borderRadius: raw.radius.pill,
          font: `500 12px/1.2 ${raw.type.familyText}`,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden style={markerCss(caption.severity)} />
        <span>{caption.hotspotId}</span>
      </button>
      {isOpen ? (
        <div
          id={panelId}
          role="group"
          aria-label={`Disclosure ${caption.disclosureId.trim()}`}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: raw.space.s2,
            maxWidth: 320,
            padding: raw.space.s3,
            background: tokens.surface.primary,
            color: tokens.text.primary,
            border: `1px solid ${raw.color.ink100}`,
            borderLeft: `3px solid ${severity.hex}`,
            borderRadius: raw.radius.md,
            boxShadow: `0 4px 16px ${raw.color.ink900}33`,
            font: `400 13px/1.45 ${raw.type.familyText}`,
          }}
        >
          <p style={{ margin: 0 }}>{caption.disclosureText}</p>
          <p style={{ margin: 0, marginTop: raw.space.s2, color: tokens.text.secondary }}>
            {`Severity: ${severity.label} (${severity.ariaHint}). This marker points at disclosure record ${caption.disclosureId.trim()}; the record, not this render, is what the dispute process reads. ${CLAIM_SCOPE_DISCLOSURE[claimScope]}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
