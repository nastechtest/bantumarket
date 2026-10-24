import type { AssetManifest } from '@nastech/api-contracts';
import { QualityReadout } from './quality-readout.js';
import { StaticPath } from './static-path.js';
import type { InspectPlan } from './inspect-decision.js';

/**
 * The static branch of the inspect route.
 *
 * This is what the buyer gets for reduced motion, `saveData`, a refused byte budget, `gl: 'none'`, a
 * lost GL context or a scene build error — the complete inspection, plus the one-line reason at the
 * top. It is not an error screen dressed up as a fallback: the reason is a status, the path below it
 * carries every condition record the scene would have pointed at. Nothing spins, nothing greys out,
 * nothing apologises (rule 1).
 */

export interface InspectStaticProps {
  readonly manifest: AssetManifest;
  readonly alt: string;
  readonly plan: InspectPlan;
  readonly backHref?: string;
}

export function InspectStatic({ manifest, alt, plan, backHref = `/item/${manifest.listingId}` }: InspectStaticProps) {
  return (
    <div className="nt-inspect-static">
      <QualityReadout plan={plan} />
      <StaticPath manifest={manifest} alt={alt} />
      <p>
        <a className="secondary" href={backHref}>
          Back to the listing
        </a>
      </p>
    </div>
  );
}
