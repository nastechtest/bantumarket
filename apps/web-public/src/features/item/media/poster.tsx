/**
 * The poster: the single photograph the listing card and the page hero both lean on.
 *
 * `eager` + `fetchpriority="high"` because this is the first-paint route — lazy-loading your own
 * hero image is how a marketplace looks broken on a Johannesburg LTE connection. On image failure
 * the box degrades into *words* (title + the pointer to the written record), never a grey square:
 * rule one says the static path must not look apologetic, and a broken jpg is the static path's
 * worst day, so its worst day is still a complete page.
 */

import { useState } from 'react';
import type { StillImage } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';

export interface PosterProps {
  readonly poster: StillImage;
  readonly title: string;
  readonly priority?: boolean;
}

export function Poster({ poster, title, priority = true }: PosterProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        data-status="poster-failed"
        style={{
          aspectRatio: '1 / 1',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: raw.space.s2,
          padding: raw.space.s4,
          background: tokens.surface.raised,
          border: `1px solid ${raw.color.ink100}`,
          borderRadius: raw.radius.md,
          color: tokens.text.secondary,
          fontFamily: raw.type.familyText,
          fontSize: '0.875rem',
        }}
      >
        <strong style={{ color: tokens.text.primary, fontFamily: raw.type.familyDisplay, fontSize: '1.0625rem' }}>
          {title}
        </strong>
        <p style={{ margin: 0 }}>
          This photograph did not load. The written condition record below is the full disclosure —
          it is what the dispute process reads, and it does not depend on this image.
        </p>
      </div>
    );
  }

  return (
    <img
      className="item-poster"
      src={poster.url}
      alt={poster.alt}
      width={poster.widthPx}
      height={poster.heightPx}
      loading={priority ? 'eager' : 'lazy'}
      {...(priority ? ({ fetchpriority: 'high' } as { [k: string]: string }) : {})}
      decoding={priority ? 'sync' : 'async'}
      onError={() => setFailed(true)}
      style={{
        width: '100%',
        height: 'auto',
        aspectRatio: '1 / 1',
        objectFit: 'cover',
        display: 'block',
        background: tokens.surface.raised,
        borderRadius: raw.radius.md,
      }}
    />
  );
}

/** A still from the strip, un-zoomed base: same failure discipline as the poster, smaller. */
export function StillThumb({ image }: { image: StillImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        data-status="still-failed"
        style={{ color: tokens.text.disabled, fontSize: '0.75rem', fontFamily: raw.type.familyText }}
      >
        photo unavailable
      </span>
    );
  }
  return (
    <img
      src={image.url}
      alt={image.alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: raw.radius.sm }}
    />
  );
}
