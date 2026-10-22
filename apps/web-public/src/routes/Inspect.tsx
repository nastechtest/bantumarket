import { useMemo, useState } from 'react';
import { CanvasHost, PosterFallback, probeCapability, canFetchScene, devicePixelRatioCap, selectLod } from '@nastech/ui-3d';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { PilotWatchPlaceholder } from '../scenes/PilotWatch.js';
import { fixtureManifest } from '../lib/fixtures.js';

/** The scene route class: loaded after the page is interactive, never the entry point of a flow. */
export default function Inspect() {
  const cap = useMemo(() => probeCapability(), []);
  const [gaveUp, setGaveUp] = useState(false);
  const decision = useMemo(() => selectLod(fixtureManifest), []);
  const allowed = canFetchScene(cap) && !gaveUp;

  return (
    <section>
      <h1>Inspect — Seiko “Presage”</h1>
      <p className="tier">LOD {decision.tier} · {(decision.bytes / 1_048_576).toFixed(2)} MB · {decision.reason}</p>
      <div className="scene" style={{ aspectRatio: '4/3' }}>
        <PosterFallback manifest={fixtureManifest} alt="Seiko Presage, studio poster" />
        {allowed ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <CanvasHost ariaLabel="3D model of the watch" dprCap={devicePixelRatioCap(cap)} onContextLost={() => setGaveUp(true)}>
              <PilotWatchPlaceholder />
            </CanvasHost>
          </div>
        ) : (
          <p className="disclosure" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
            3D is off on this device or connection. The photographs and the condition list below are the same record.
          </p>
        )}
      </div>
      <p className="disclosure">{CLAIM_SCOPE_DISCLOSURE[fixtureManifest.claimScope]}</p>
      <p><a href="/item/lst_01">Back to the listing</a></p>
    </section>
  );
}
