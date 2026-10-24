/**
 * `noindex` is a console invariant, not a page preference: a search engine result for a payout
 * screen is a leak even when the page redirects. `index.html` carries the tag for first paint; this
 * function is the runtime backstop for a document assembled by a test, a proxy or a future host.
 */
export function installNoindex(doc: Document): HTMLMetaElement {
  const metas = Array.from(doc.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]'));
  const existing = metas[0];
  const meta = existing ?? doc.createElement('meta');
  if (existing === undefined) {
    meta.setAttribute('name', 'robots');
    doc.head.appendChild(meta);
  }
  // A duplicated robots tag has undefined precedence between crawlers. One tag, merged directives.
  for (const duplicate of metas.slice(1)) duplicate.remove();

  const directives = (meta.getAttribute('content') ?? '')
    .split(',')
    .map((directive) => directive.trim())
    .filter((directive) => directive.length > 0);
  const hasNoindex = directives.some((directive) => directive.toLowerCase() === 'noindex');
  if (!hasNoindex) meta.setAttribute('content', ['noindex', ...directives].join(', '));
  return meta;
}
