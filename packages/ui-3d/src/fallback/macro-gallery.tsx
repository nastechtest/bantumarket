import { useRef, useState } from 'react';
import type { AssetManifest, ConditionCaption } from '@nastech/api-contracts';
import { trySignedUrlFor, type SourcedRendition } from './frame-strip.js';

/**
 * The macro photographs (07 §4.4): the hairline at 2 o'clock, the clasp wear. These are the same
 * records the 3D callouts point at, matched by `disclosureId`, so a buyer on the static path is
 * reading the identical evidence file as a buyer in the scene — not a summary of it.
 *
 * A macro is *not* a second angle on the item; it is a claim about one specific flaw. Every slide
 * therefore carries its caption, and a slide whose photograph has not landed still carries the text,
 * because the text is what the dispute process reads.
 */

export interface MacroSlide {
  readonly id: string;
  /** Null when the media endpoint has not issued a URL yet; the caption still renders. */
  readonly url: string | null;
  readonly alt: string;
  readonly caption: ConditionCaption | null;
}

/**
 * Pairing is `hotspotId === rendition.id` first, then capture order, so the scene's callout hotspots
 * and these photographs resolve to the same disclosure record whichever way the capture labelled them.
 */
export function macroSlides(manifest: AssetManifest): readonly MacroSlide[] {
  const macros = manifest.renditions.filter((r) => r.kind === 'MACRO');
  return macros.map((rendition, index) => {
    const caption =
      manifest.captions.find((c) => c.hotspotId === rendition.id) ?? manifest.captions[index] ?? null;
    return {
      id: rendition.id,
      url: trySignedUrlFor(rendition as SourcedRendition),
      alt: caption ? `${caption.disclosureText}` : `Macro detail ${index + 1} of ${rendition.id}`,
      caption,
    };
  });
}

/** Wraps rather than dead-ends: a turntable the buyer can get stuck on reads as a broken control. */
export function stepSlide(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const wrapped = Math.floor(index) + Math.floor(delta);
  return ((wrapped % count) + count) % count;
}

/** Maps the keys a carousel is expected to answer; null means "not ours, let the page scroll". */
export function slideIndexForKey(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return stepSlide(index, 1, count);
    case 'ArrowLeft':
    case 'ArrowUp':
      return stepSlide(index, -1, count);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** How far a drag must travel to count as a swipe, in CSS px. Below this it was a tap. */
const SWIPE_THRESHOLD_PX = 24;

export interface MacroGalleryProps {
  readonly manifest: AssetManifest;
  readonly title?: string;
}

export function MacroGallery({ manifest, title = 'Close-up details' }: MacroGalleryProps) {
  const slides = macroSlides(manifest);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const dragStartX = useRef<number | null>(null);

  if (count === 0) return null;
  const current = stepSlide(index, 0, count);
  const slide = slides[current]!;

  const endDrag = (clientX: number) => {
    const start = dragStartX.current;
    dragStartX.current = null;
    // A gesture with no coordinates is not a swipe. Reading `undefined - undefined` as NaN and then
    // letting it through makes every tap look like a drag-past-threshold on engines without geometry.
    if (start === null || !Number.isFinite(clientX) || !Number.isFinite(start)) return;
    const dx = clientX - start;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    setIndex((i) => stepSlide(i, dx < 0 ? 1 : -1, count));
  };

  return (
    <section
      className="nt-macro"
      role="group"
      aria-roledescription="carousel"
      aria-label={`${title}, ${count} photograph${count === 1 ? '' : 's'}`}
      tabIndex={0}
      onKeyDown={(e) => {
        const next = slideIndexForKey(e.key, current, count);
        if (next === null) return;
        e.preventDefault();
        setIndex(next);
      }}
      onPointerDown={(e) => {
        // Pointer capture is missing in jsdom and on older Safari; a swipe is a nicety, not a dependency.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragStartX.current = e.clientX;
      }}
      onPointerUp={(e) => endDrag(e.clientX)}
      onPointerCancel={() => {
        dragStartX.current = null;
      }}
      style={{ touchAction: 'pan-y' }}
    >
      <h2 className="nt-macro__title">{title}</h2>
      <p className="nt-macro__help">Swipe, or use the arrow keys, to move between details.</p>

      <figure className="nt-macro__slide" data-slide={current}>
        {slide.url ? (
          <img
            className="nt-macro__image"
            src={slide.url}
            alt={slide.alt}
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="nt-macro__image nt-macro__image--missing" role="img" aria-label={`${slide.alt} (photograph unavailable)`}>
            Photograph unavailable — the written note below still applies.
          </div>
        )}
        <figcaption className="nt-macro__caption">
          <strong className="nt-macro__position">
            Detail {current + 1} of {count}
          </strong>
          {slide.caption ? (
            <>
              <span className="nt-macro__text">{slide.caption.disclosureText}</span>
              <span className="nt-macro__record">
                {slide.caption.severity} · record <code>{slide.caption.disclosureId}</code>
              </span>
            </>
          ) : (
            <span className="nt-macro__text">No written note is attached to this detail.</span>
          )}
        </figcaption>
      </figure>

      <div className="nt-macro__controls">
        <button type="button" aria-label="Previous detail" onClick={() => setIndex((i) => stepSlide(i, -1, count))}>
          ←
        </button>
        <ol className="nt-macro__dots">
          {slides.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                aria-label={`Detail ${i + 1} of ${count}`}
                aria-current={i === current}
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" aria-label="Next detail" onClick={() => setIndex((i) => stepSlide(i, 1, count))}>
          →
        </button>
      </div>

      <p className="nt-macro__status" role="status" aria-live="polite">
        Detail {current + 1} of {count}: {slide.caption?.disclosureText ?? 'no written note'}
      </p>
    </section>
  );
}
