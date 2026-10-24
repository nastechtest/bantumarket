import { useMemo, useState } from 'react';
import { canFetchScene, probeCapability, UNSUPPORTED, type Capability } from '@nastech/ui-3d/quality';
import type { RouteDef } from '../router.js';
import { fixtureListings, fixtureManifest } from '../lib/fixtures.js';
import { CategoryShowcase, HeroPoster, HeroScene } from '../features/brand/index.js';
import { STATIC_REASON_TEXT } from '../features/inspect/inspect-decision.js';

/**
 * Home (brand route class, ≤220 KB).
 *
 * Three brand surfaces only, each flat (07 §5.1): the poster hero, the category showcase, and the
 * opt-in hero scene layered over the poster. The scene is fetched only when the buyer taps to view it —
 * `HeroScene` dynamic-imports the runtime — so this chunk ships no `three`, and the discovery grid is
 * plain images. No glass, no gradient, no cursor effects, no cinematic transition appears anywhere in
 * the markup; the only flat note is the honest one-line reason a 3D view is not offered on this device.
 */
export default function Home({ route }: { route: RouteDef }) {
  const cap = useMemo<Capability>(() => (typeof window === 'undefined' ? UNSUPPORTED : probeCapability()), []);
  const [requested, setRequested] = useState(false);
  const [sceneGaveUp, setSceneGaveUp] = useState(false);

  const canView3d = canFetchScene(cap);
  const offReason = !canView3d ? pickOffReason(cap) : null;

  return (
    <>
      <section className="nt-hero-shell">
        <HeroPoster
          manifest={fixtureManifest}
          alt="Seiko Presage, photographed on our studio turntable"
          heading="See the thing before you buy it."
          blurb="Every pre-owned watch on NasTech is photographed from 48 angles and rebuilt so you can turn it over yourself — the scratch, the replaced crystal, the wear on the clasp."
        />
        <div className="nt-hero-shell__scene">
          {canView3d && !sceneGaveUp ? (
            <>
              {!requested ? (
                <button type="button" onClick={() => setRequested(true)}>
                  View in 3D
                </button>
              ) : null}
              <HeroScene
                manifest={fixtureManifest}
                alt="the featured watch"
                capability={cap}
                requested={requested}
                onContextLost={() => setSceneGaveUp(true)}
              />
            </>
          ) : (
            <p className="disclosure">{offReason ?? 'Photographs shown.'}</p>
          )}
        </div>
      </section>

      <CategoryShowcase listings={fixtureListings} />

      <p className="tier">Route class: {route.class} · brand surfaces only</p>
    </>
  );
}

function pickOffReason(cap: Capability): string {
  if (cap.gl === 'none') return STATIC_REASON_TEXT['no-webgl'];
  if (cap.saveData) return STATIC_REASON_TEXT['save-data'];
  return STATIC_REASON_TEXT['connection'];
}
