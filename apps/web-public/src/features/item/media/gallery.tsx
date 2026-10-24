/**
 * The media stage: photographs first, turntable when the capture produced one.
 *
 * Two modes, both complete products on their own: "Photos" pages through poster + stills with
 * tap-to-zoom; "12-frame turntable" drags through the capture strip. A listing with `turntable:
 * null` simply never renders the second tab — no disabled ghost-tab that whispers "the good page
 * is elsewhere". The 3D model, when it exists, is reached by the inspect link in the buy bar,
 * never from inside this component; this file is inside the 170 KB first-paint budget and must
 * contain zero scene bytes (see fence.test.ts).
 */

import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { ItemDetail, StillImage } from '../api/item-transport.js';
import { TURNTABLE_FRAME_COUNT } from '../api/item-transport.js';
import { raw, tokens } from '@nastech/design-tokens';
import { Poster, StillThumb } from './poster.js';
import { FrameIndicator } from './frame-indicator.js';
import { useTurntable, stripFrameStyle } from './turntable.js';
import { useZoomOnTap, zoomTransformStyle, ZOOM_LEVEL } from './zoom-on-tap.js';

export type Mode = 'photos' | 'turntable';

export interface GalleryProps {
  readonly detail: ItemDetail;
  /** Tests (and deep links like `#turntable`) can open on the strip; users get photos first. */
  readonly initialMode?: Mode;
}

export function Gallery({ detail, initialMode = 'photos' }: GalleryProps) {
  const photos = useMemo<StillImage[]>(() => [detail.poster, ...detail.stills], [detail]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const hasTurntable = detail.turntable !== null;
  const [mode, setMode] = useState<Mode>(initialMode === 'turntable' && detail.turntable === null ? 'photos' : initialMode);

  const nextPhoto = useCallback(
    (step: number) => setPhotoIndex((i) => (i + step + photos.length) % photos.length),
    [photos.length],
  );

  return (
    <section className="item-gallery" aria-label={`Photographs of ${detail.title}`} style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3 }}>
      {(hasTurntable ? true : photos.length > 1) && (
        <div role="tablist" aria-label="Media views" style={{ display: 'flex', gap: raw.space.s2 }}>
          <ModeTab active={mode === 'photos'} onClick={() => setMode('photos')}>
            Photos ({photos.length})
          </ModeTab>
          {hasTurntable ? (
            <ModeTab active={mode === 'turntable'} onClick={() => setMode('turntable')}>
              {TURNTABLE_FRAME_COUNT}-frame turntable
            </ModeTab>
          ) : null}
        </div>
      )}

      {mode === 'turntable' && detail.turntable !== null ? (
        <TurntableStage detail={detail} />
      ) : (
        <PhotoStage
          image={photos[photoIndex] ?? detail.poster}
          caption={`${photoIndex + 1} of ${photos.length} — tap to ${'zoom in'}`}
          priority={photoIndex === 0}
          onPrev={() => nextPhoto(-1)}
          onNext={() => nextPhoto(1)}
        />
      )}

      {photos.length > 1 ? (
        <ol
          aria-label="All photographs"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: raw.space.s2, margin: 0, padding: 0, listStyle: 'none' }}
        >
          {photos.map((photo, i) => (
            <li key={photo.id} style={{ aspectRatio: '1 / 1' }}>
              <button
                type="button"
                onClick={() => {
                  setMode('photos');
                  setPhotoIndex(i);
                }}
                aria-label={`View photo ${i + 1}: ${photo.alt}`}
                aria-current={mode === 'photos' && i === photoIndex ? 'true' : undefined}
                style={{
                  width: '100%',
                  height: '100%',
                  padding: 0,
                  border: `1px solid ${mode === 'photos' && i === photoIndex ? tokens.action.default : raw.color.ink100}`,
                  borderRadius: raw.radius.sm,
                  background: tokens.surface.raised,
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                <StillThumb image={photo} />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        fontFamily: raw.type.familyText,
        fontSize: '0.8125rem',
        padding: `${raw.space.s1} ${raw.space.s3}`,
        borderRadius: raw.radius.pill,
        border: `1px solid ${active ? tokens.action.default : raw.color.ink100}`,
        background: active ? tokens.surface.raised : 'transparent',
        color: active ? tokens.text.primary : tokens.text.secondary,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function PhotoStage({ image, caption, priority, onPrev, onNext }: { image: StillImage; caption: string; priority: boolean; onPrev: () => void; onNext: () => void }) {
  const zoom = useZoomOnTap();
  const frameStyle: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: raw.radius.md,
    background: tokens.surface.raised,
    aspectRatio: '1 / 1',
  };
  return (
    <div style={frameStyle}>
      <button
        type="button"
        onClick={zoom.toggle}
        aria-label={`${image.alt} — ${zoom.zoomed ? `zoomed ${ZOOM_LEVEL} times, tap to flatten` : 'tap to zoom'}`}
        data-zoomed={zoom.zoomed ? 'true' : 'false'}
        style={{ all: 'unset', display: 'block', width: '100%', height: '100%', cursor: zoom.zoomed ? 'zoom-out' : 'zoom-in' }}
      >
        <div style={{ width: '100%', height: '100%', ...(zoomTransformStyle(zoom.zoomed, zoom.originX, zoom.originY) ?? {}) }}>
          <Poster poster={image} title={image.alt} priority={priority} />
        </div>
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${raw.space.s1} 0` }}>
        <button type="button" onClick={onPrev} aria-label="Previous photograph" style={navButtonStyle}>
          ←
        </button>
        <span style={{ color: tokens.text.secondary, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>{caption}</span>
        <button type="button" onClick={onNext} aria-label="Next photograph" style={navButtonStyle}>
          →
        </button>
      </div>
    </div>
  );
}

const navButtonStyle: CSSProperties = {
  border: `1px solid ${raw.color.ink100}`,
  background: tokens.surface.primary,
  borderRadius: raw.radius.pill,
  width: 32,
  height: 32,
  cursor: 'pointer',
  color: tokens.text.primary,
};

function TurntableStage({ detail }: { detail: ItemDetail }) {
  const tt = useTurntable(0);
  const turntable = detail.turntable;
  if (turntable === null) return null;

  const surfaceStyle: CSSProperties =
    turntable.kind === 'strip'
      ? { ...stripFrameStyle(tt.frame, turntable.stripUrl), aspectRatio: '1 / 1', borderRadius: raw.radius.md, touchAction: 'none', cursor: tt.dragging ? 'grabbing' : 'grab' }
      : { aspectRatio: '1 / 1', borderRadius: raw.radius.md, touchAction: 'none', cursor: tt.dragging ? 'grabbing' : 'grab', position: 'relative', background: tokens.surface.raised };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2 }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Turntable for ${detail.title} — drag or use arrow keys to rotate through ${TURNTABLE_FRAME_COUNT} photographs`}
        aria-valuemin={1}
        aria-valuemax={TURNTABLE_FRAME_COUNT}
        aria-valuenow={tt.frame + 1}
        aria-valuetext={`Frame ${tt.frame + 1} of ${TURNTABLE_FRAME_COUNT}`}
        {...tt.handlers}
        style={{ ...surfaceStyle, border: `1px solid ${raw.color.ink100}`, overflow: 'hidden' }}
      >
        {turntable.kind === 'sequence' ? (
          <img
            src={turntable.urls[tt.frame] ?? turntable.urls[0]}
            alt={`${detail.title} — frame ${tt.frame + 1} of ${TURNTABLE_FRAME_COUNT} around the item`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            draggable={false}
          />
        ) : null}
      </div>
      <FrameIndicator frame={tt.frame} onSelect={tt.setFrame} />
      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}>
        Twelve photographs taken around this item, {tt.dragging ? 'following your drag' : 'drag sideways or press arrow keys'}.
      </p>
    </div>
  );
}
