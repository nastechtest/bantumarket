import { useState } from 'react';
import type { ListingSummary } from '@nastech/api-contracts';

/**
 * Brand surface 2 — the category showcase.
 *
 * Named "transition" after the *content* switch, not an animation: selecting a category swaps the list
 * instantly, with no fade, no slide, no cinematic reveal (07 §5.1 and the brief's brand rules — the
 * home/discovery class is a place for restraint, not theatre). Three surfaces is the whole brand
 * budget for motion-bearing pixels; this one has none. Money is formatted locally so this file carries
 * no dependency that could pull a scene runtime by accident.
 */

export interface Category {
  readonly slug: string;
  readonly label: string;
}

const PILOT_CATEGORIES: readonly Category[] = [
  { slug: 'pre-owned-watches', label: 'Pre-owned watches' },
  { slug: 'pre-owned-mechanical', label: 'Mechanical' },
  { slug: 'pre-owned-quartz', label: 'Quartz' },
];

function formatRand(cents: number): string {
  return `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
}

export interface CategoryShowcaseProps {
  readonly listings: readonly ListingSummary[];
  readonly heading?: string;
}

export function CategoryShowcase({ listings, heading = 'In the pilot' }: CategoryShowcaseProps) {
  const [active, setActive] = useState(PILOT_CATEGORIES[0]!.slug);
  // The pilot stocks one category; the selector still works and filters honestly rather than pretending
  // to have inventory it does not.
  const shown = listings.filter((l) => l.categorySlug === active || active === PILOT_CATEGORIES[0]!.slug);

  return (
    <section className="nt-category" aria-label={heading}>
      <div className="nt-category__tabs" role="tablist" aria-label="Category">
        {PILOT_CATEGORIES.map((c) => (
          <button
            key={c.slug}
            type="button"
            role="tab"
            aria-selected={c.slug === active}
            className={c.slug === active ? 'nt-category__tab nt-category__tab--active' : 'nt-category__tab secondary'}
            onClick={() => setActive(c.slug)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ul className="nt-category__grid">
        {shown.map((l) => (
          <li key={l.id}>
            <a className="card" href={`/item/${l.id}`}>
              <img src={l.posterUrl} alt="" width={400} height={400} loading="lazy" />
              <div className="body">
                <p className="tier">
                  {l.sellerTier} · {l.has3d ? 'Photographed in 3D programme' : 'Photographs'}
                </p>
                <h3>{l.title}</h3>
                <p className="price">{formatRand(l.price.cents)}</p>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { PILOT_CATEGORIES };
