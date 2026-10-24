import { renderToStaticMarkup } from 'react-dom/server';

/** Fast path for assertions about rendered output; interaction tests use testing-library. */
export function markup(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node);
}

export function textOf(markupString: string): string {
  return markupString
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
