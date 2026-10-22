import { fixtureListings } from '../lib/fixtures.js';
export default function Search() {
  return (
    <section>
      <h1>Search</h1>
      <div className="grid">
        {fixtureListings.map((l) => (
          <a key={l.id} className="card" href={`/item/${l.id}`}>
            <img src={l.posterUrl} alt="" width={400} height={400} loading="lazy" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
            <div className="body"><h3 style={{ fontSize: '1rem', margin: 0 }}>{l.title}</h3><p className="price">R{(l.price.cents / 100).toFixed(0)}</p></div>
          </a>
        ))}
      </div>
      <p className="disclosure">Ranking does not favour listings that have a 3D model. A listing with a model and a listing without one are ranked on the same fields.</p>
    </section>
  );
}
