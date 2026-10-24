import { CLAIM_SCOPE_DISCLOSURE, type AssetManifest } from '@nastech/api-contracts';
import { ConditionTable, MacroGallery, PosterFallback, TurntableSprite } from '@nastech/ui-3d/fallback';

/**
 * The complete static path — poster + 12-frame turntable + the written condition records + macro
 * photographs (07 §4.4). It is *sufficient, not inferior*: it is the same capture session and the
 * same disclosure file the 3D callouts point at, so it is the delivery for the low-end cohort and the
 * landing spot for every scene exit (reduced motion, save-data, refused budget, no WebGL, context
 * loss, build error). There is no spinner, no grey box, no apology anywhere in here.
 *
 * `@nastech/ui-3d/fallback` is a static, GL-free edge, so this whole view ships in the inspect
 * route's own chunk and needs no dynamic import. The item page (another agent) shows its own poster;
 * this is the *inspection* delivery, which is allowed to carry the turntable and the full table.
 */

export interface StaticPathProps {
  readonly manifest: AssetManifest;
  readonly alt: string;
  /** Optional buyer-facing sentence appended under the images (e.g. a scene-exit reason). */
  readonly note?: React.ReactNode;
}

export function StaticPath({ manifest, alt, note }: StaticPathProps) {
  return (
    <div className="nt-static-path">
      <figure className="nt-static-path__poster">
        <PosterFallback manifest={manifest} alt={`${alt} — studio poster`} />
      </figure>

      <section className="nt-static-path__turntable" aria-label="Turntable — drag to rotate through the captured angles">
        <TurntableSprite manifest={manifest} alt={alt} />
        <p className="nt-static-path__hint">Turn with a drag or the arrow keys. Twelve angles from the same session as the photographs.</p>
      </section>

      <MacroGallery manifest={manifest} title="Close-up details" />

      <ConditionTable captions={manifest.captions} listingId={manifest.listingId} />

      <p className="disclosure">{CLAIM_SCOPE_DISCLOSURE[manifest.claimScope]}</p>

      {note ? <p className="nt-static-path__note">{note}</p> : null}
    </div>
  );
}
