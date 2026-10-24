import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

export function markup(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

export function parse(source: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = source;
  return host;
}

export function normalise(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function textOf(source: string): string {
  return normalise(parse(source).textContent);
}

export function mainTextOf(source: string): string {
  return normalise(parse(source).querySelector('main')?.textContent ?? '');
}

export function countOf(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}
