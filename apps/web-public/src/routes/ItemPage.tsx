import { useMemo } from 'react';
import { PosterFallback, TurntableSprite } from '@nastech/ui-3d/fallback';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { fixtureManifest } from '../lib/fixtures.js';
import type { RouteDef } from '../router.js';

/**
 * First-paint class. The poster and the 12-frame turntable are the item page; the scene is a link
 * to a separate route with its own budget. A buyer who never taps it is missing nothing (07 §4.4).
 */
export default function ItemPage({ route }: { route: RouteDef }) {
  const m = fixtureManifest;
  return (
    <article className="item">
      <section className="hero">
        <div className="scene">
          <TurntableSprite manifest={m} alt="Seiko Presage — drag to rotate through 12 photographs" />
        </div>
        <div>
          <p className="tier">T4 · Item inspected · Pilot category</p>
          <h1>Seiko “Presage” automatic, 40.5 mm</h1>
          <p className="price" style={{ fontSize: '1.5rem' }}>R4,200</p>
          <p className="lede">Case serial matches the movement plate. One hairline at 2 o’clock, crystal replaced.</p>
          <p>
            <a className="button" href="/item/lst_01/inspect">Inspect in 3D</a>{' '}
            <a className="button secondary" href="/checkout/ord_01">Buy</a>
          </p>
          <p className="disclosure">{CLAIM_SCOPE_DISCLOSURE[m.claimScope]}</p>
        </div>
      </section>
      <section>
        <h2>Condition, in words</h2>
        <ul>
          {m.captions.map((c) => (
            <li key={c.hotspotId}>
              <strong>{c.severity}</strong> — {c.disclosureText} <small>(record {c.disclosureId})</small>
            </li>
          ))}
        </ul>
        <p style={{ color: 'var(--ink-500)', fontSize: '.85rem' }}>Route class: {route.class}</p>
      </section>
    </article>
  );
}
