/**
 * Share button over the pure `share.ts` outcomes. The visible state *is* the outcome: "shared"
 * says Shared, "copied" says Link copied, "unsupported" leaves the URL selectable on screen. It
 * never shows a success tick it did not earn.
 */

import { useState } from 'react';
import type { ItemDetail } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';
import { buildShareUrl, shareListing } from './share.js';
import type { ShareCapabilities, ShareOutcome } from './share.js';

export function ShareButton({ detail }: { detail: ItemDetail }) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const url = buildShareUrl(detail.listingId);

  const onClick = () => {
    void shareListing(detail, {
      ...(typeof navigator === 'undefined' ? {} : { navigator: navigator as ShareCapabilities['navigator'] }),
      ...(typeof navigator !== 'undefined' && navigator.clipboard !== undefined ? { clipboard: navigator.clipboard } : {}),
    }).then(setOutcome);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: raw.space.s2, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          background: 'transparent',
          border: `1px solid ${raw.color.ink100}`,
          borderRadius: raw.radius.md,
          padding: `${raw.space.s1} ${raw.space.s3}`,
          color: tokens.text.primary,
          fontFamily: raw.type.familyText,
          fontSize: '0.8125rem',
          cursor: 'pointer',
        }}
      >
        {outcome?.kind === 'shared' ? 'Shared' : outcome?.kind === 'copied' ? 'Link copied' : 'Share'}
      </button>
      {outcome?.kind === 'unsupported' ? (
        <code style={{ fontSize: '0.75rem', color: tokens.text.secondary, fontFamily: raw.type.familyMono, userSelect: 'all' }}>{url}</code>
      ) : null}
    </span>
  );
}
