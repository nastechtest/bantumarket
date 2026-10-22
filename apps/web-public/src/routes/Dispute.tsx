/** Critical route. Evidence upload is a file input, not a camera or a render. */
export default function Dispute() {
  return (
    <section>
      <h1>Open a dispute</h1>
      <p>Tell us what is different from the listing. The condition record the seller agreed to is attached automatically.</p>
      <label htmlFor="d">What is wrong</label>
      <textarea id="d" rows={5} />
      <label htmlFor="f">Photos</label>
      <input id="f" type="file" accept="image/*" multiple />
      <button type="button">Submit dispute</button>
    </section>
  );
}
