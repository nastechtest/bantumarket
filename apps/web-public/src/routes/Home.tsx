import { useMemo, useState } from 'react';
import { CanvasHost, PosterFallback, probeCapability, canFetchScene, devicePixelRatioCap } from '@nastech/ui-3d';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { PilotWatchPlaceholder } from '../scenes/PilotWatch.js';
import { fixtureListings, fixtureManifest } from '../lib/fixtures.js';
import type { RouteDef } from '../router.js';

/** Brand surface 1 (07 §5.1): poster underneath, scene on top, and the scene is optional forever. */
export default function Home({ route }: { route: RouteDef }) {
  const cap = useMemo(() => probeCapability(), []);
  const [sceneGaveUp, setSceneGaveUp] = useState(false);
  const showScene = canFetchScene(cap) && !sceneGaveUp;
  const money = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

  return (
    <>
      <section className="hero">
        <div>
          <p className="tier">South Africa · user to user</p>
          <h1>See the thing before you buy it.</h1>
          <p className="lede">
            Every pre-owned watch on NasTech is photographed from 48 angles and rebuilt so you can turn it
            over yourself — the scratch, the replaced crystal, the wear on the clasp. {CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition}
          </p>
          <p><a className="button" href="/item/lst_01">Browse the pilot category</a></p>
        </div>
        <div className="scene">
          <PosterFallback manifest={fixtureManifest} alt="Seiko Presage, photographed on our studio turntable" eager />
          {showScene ? (
            <div style={{ position: 'absolute', inset: 0 }}>
              <CanvasHost
                ariaLabel="Interactive 3D model of the featured watch"
                dprCap={devicePixelRatioCap(cap)}
                onContextLost={() => setSceneGaveUp(true)}
              >
                <PilotWatchPlaceholder />
              </CanvasHost>
            </div>
          ) : (
            <p className="disclosure" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              Showing photographs. {cap.gl === 'none' ? 'This browser cannot display 3D.' : 'Saved on this connection.'}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2>Fresh in the pilot</h2>
        <div className="grid">
          {fixtureListings.map((l) => (
            <a key={l.id} className="card" href={`/item/${l.id}`}>
              <img src={l.posterUrl} alt="" width={400} height={400} loading="lazy" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', background: 'var(--paper-warm)' }} />
              <div className="body">
                <p className="tier">{l.sellerTier} · {l.has3d ? '3D inspected' : 'Photographs'}</p>
                <h3 style={{ fontSize: '1rem', margin: '0 0 6px' }}>{l.title}</h3>
                <p className="price">{money(l.price.cents)}</p>
              </div>
            </a>
          ))}
        </div>
        <p style={{ color: 'var(--ink-500)', fontSize: '.85rem' }}>Route class: {route.class}</p>
      </section>
    </>
  );
}
