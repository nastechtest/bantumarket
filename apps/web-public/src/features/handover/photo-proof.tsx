import { useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * An optional photograph of the exchange itself.
 *
 * Two properties are load-bearing and this component is written so neither can be broken by
 * an edit:
 *   1. It NEVER blocks. There is no path from here to the confirm button's `disabled` state,
 *      no required flag, no "add a photo first" copy. The confirm screen stands alone.
 *   2. It is a receipt that the exchange happened — not evidence of condition. Condition is
 *      what the listing's written disclosures say (that is the record disputes read). The
 *      wording here is the guard; the file upload itself is a CONTRACT-GAP until a media
 *      endpoint exists — captured locally, previewed locally, and honestly labelled.
 */

export interface PhotoProofProps {
  /** Receives the chosen File. Absent or failing must not affect anything else on screen. */
  readonly onCapture?: (file: File) => void;
}

export function PhotoProof({ onCapture }: PhotoProofProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFailed(false);
    try {
      // Object URLs are a browser API; in a DOM-less environment the preview just stays absent —
      // which is allowed, because a photo can never be required.
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        setPreviewUrl((old) => {
          if (old !== null && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(old);
          return URL.createObjectURL(file);
        });
      }
      onCapture?.(file);
    } catch {
      // Capture failed: say so once, and move on. The handover continues without it.
      setFailed(true);
    }
  };

  const clear = () => {
    if (previewUrl !== null && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileName(null);
    setFailed(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <section
      data-testid="photo-proof"
      aria-label="Photo of the exchange (optional)"
      style={{ display: 'grid', gap: raw.space.s2, fontFamily: raw.type.familyText }}
    >
      <h3 style={{ margin: 0, fontSize: '1rem', color: tokens.text.primary }}>
        Photo of the exchange <span style={{ fontWeight: 400, color: tokens.text.secondary }}>(optional — you never need this)</span>
      </h3>
      <p style={{ margin: 0, fontSize: '0.875rem', color: tokens.text.secondary, lineHeight: 1.5 }}>
        One photo of the two of you with the item is a receipt that this happened. It says nothing
        about whether the watch works, is authentic or is water-resistant — the item is agreed on
        the listing’s written condition words, and this photo does not change them.
      </p>
      <div style={{ display: 'flex', gap: raw.space.s3, alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={inputRef} data-testid="photo-input" type="file" accept="image/*" onChange={pick} />
        {fileName !== null ? <button type="button" onClick={clear} style={linkish}>Remove</button> : null}
      </div>
      {previewUrl !== null ? (
        <img src={previewUrl} alt={`Photo of the exchange: ${fileName ?? 'preview'}`} style={{ maxWidth: '100%', borderRadius: raw.radius.md }} />
      ) : null}
      {failed ? (
        <p style={{ margin: 0, fontSize: '0.875rem', color: raw.color.signalCaution }}>
          The photo could not be attached — fine. Confirm the handover as normal; this was optional.
        </p>
      ) : null}
    </section>
  );
}

const linkish: CSSProperties = { background: 'none', border: 'none', color: tokens.action.default, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' };
