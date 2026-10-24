import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { bootConsoleDocument } from '../bootstrap.js';
import { installNoindex } from '../lib/noindex.js';

function freshDocument(head = ''): Document {
  return new JSDOM(`<!doctype html><html><head>${head}</head><body></body></html>`).window.document;
}

function robots(doc: Document): HTMLMetaElement[] {
  return Array.from(doc.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]'));
}

describe('noindex invariants', () => {
  it('ships noindex in index.html before any script runs', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
    const doc = new JSDOM(html).window.document;
    const metas = robots(doc);
    expect(metas.length).toBe(1);
    expect(metas[0]?.getAttribute('content')?.toLowerCase().split(',').map((part) => part.trim())).toContain('noindex');
  });

  it('creates the robots tag when a document has none', () => {
    const doc = freshDocument();
    const meta = installNoindex(doc);
    expect(robots(doc)).toEqual([meta]);
    expect(meta.getAttribute('content')).toBe('noindex');
  });

  it('merges noindex into an existing directive list without losing the others', () => {
    const doc = freshDocument('<meta name="robots" content="noarchive, nofollow">');
    installNoindex(doc);
    const metas = robots(doc);
    expect(metas.length).toBe(1);
    const directives = metas[0]!.getAttribute('content')!.split(',').map((part) => part.trim().toLowerCase());
    expect(directives).toContain('noindex');
    expect(directives).toContain('noarchive');
    expect(directives).toContain('nofollow');
  });

  it('collapses duplicate robots tags into one', () => {
    const doc = freshDocument(
      '<meta name="robots" content="index"><meta name="robots" content="noindex"><meta name="robots" content="follow">',
    );
    installNoindex(doc);
    expect(robots(doc).length).toBe(1);
    const directives = robots(doc)[0]!.getAttribute('content')!.split(',').map((part) => part.trim().toLowerCase());
    expect(directives).toContain('noindex');
    expect(directives).toContain('index');
  });

  it('is idempotent', () => {
    const doc = freshDocument('<meta name="robots" content="noindex">');
    installNoindex(doc);
    installNoindex(doc);
    expect(robots(doc).length).toBe(1);
    expect(robots(doc)[0]?.getAttribute('content')).toBe('noindex');
  });

  it('applies the document-level console invariants at boot', () => {
    const doc = freshDocument();
    bootConsoleDocument(doc);
    expect(doc.documentElement.getAttribute('data-surface')).toBe('staff');
    expect(robots(doc).length).toBe(1);
    expect(robots(doc)[0]?.getAttribute('content')).toBe('noindex');
  });
});
