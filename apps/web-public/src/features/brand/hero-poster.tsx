import type { AssetManifest } from '@nastech/api-contracts';
import { PosterFallback } from '@nastech/ui-3d/fallback';

/**
 * Brand surface 1 — the home hero, poster-first.
 *
 * This is the default, and the one thing every buyer sees: a real photograph from the capture session,
 * flat on paper. No glass, no gradient, no cursor effect, no cinematic reveal (07 §5.1 and the brief's
 * brand rules). The interactive scene, if the buyer opts in, layers over the poster in `HeroScene`;
 * until then this is the whole hero, and it is complete on its own — the poster is not a placeholder
 * for the 3D, it is the item shown honestly.
 */

export interface HeroPosterProps {
  readonly manifest: AssetManifest;
  readonly alt: string;
  readonly heading: string;
  readonly blurb: string;
}

export function HeroPoster({ manifest, alt, heading, blurb }: HeroPosterProps) {
  return (
    <section className="nt-hero" aria-label={heading}>
      <div className="nt-hero__copy">
        <p className="tier">South Africa · user to user</p>
        <h1 className="nt-hero__title">{heading}</h1>
        <p className="lede">{blurb}</p>
        <p>
          <a className="button" href="/item/lst_01">
            Browse the pilot category
          </a>
        </p>
      </div>
      <div className="nt-hero__visual">
        <PosterFallback manifest={manifest} alt={alt} eager />
      </div>
    </section>
  );
}
