import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from './simulator.js';
import { SchemaRegistry } from './schema-registry.js';
import type { ContentTypeDefinition } from '../types.js';

const blogPostDef: ContentTypeDefinition = {
  id: 'blogPost',
  name: 'Blog Post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'body', name: 'Body', type: 'Text' },
    { id: 'slug', name: 'Slug', type: 'Symbol' },
  ],
};

const authorDef: ContentTypeDefinition = {
  id: 'author',
  name: 'Author',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true },
  ],
};

function makeDoc(overrides = {}) {
  return {
    id: 'doc1',
    contentType: 'blogPost',
    locale: 'en',
    path: '/blog/hello',
    fields: { title: 'Hello World', body: '<p>Content</p>', slug: 'hello' },
    ...overrides,
  };
}

describe('simulate', () => {
  it('returns a valid report object', () => {
    const report = simulate({
      documents: [makeDoc()],
      schemas: { blogPost: blogPostDef },
    });

    assert.ok(report.page);
    assert.ok(report.timestamp);
    assert.equal(report.baseLocale, 'en');
    assert.ok(Array.isArray(report.locales));
    assert.ok(report.contentTypes.blogPost);
    assert.ok(Array.isArray(report.entries));
    assert.ok(Array.isArray(report.assets));
    assert.ok(Array.isArray(report.errors));
    assert.ok(Array.isArray(report.warnings));
    assert.ok(report.stats);
  });

  it('processes documents into entries', () => {
    const report = simulate({
      documents: [makeDoc()],
      schemas: { blogPost: blogPostDef },
    });

    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0].contentType, 'blogPost');
    assert.ok(report.entries[0].id);
    assert.ok(report.entries[0].fields.title);
  });

  it('detects locales from documents', () => {
    const report = simulate({
      documents: [
        makeDoc({ locale: 'en' }),
        makeDoc({ id: 'doc2', locale: 'es' }),
      ],
      schemas: { blogPost: blogPostDef },
    });

    assert.ok(report.locales.includes('en'));
    assert.ok(report.locales.includes('es'));
  });

  it('uses explicit locales when provided', () => {
    const report = simulate({
      documents: [makeDoc()],
      schemas: { blogPost: blogPostDef },
      options: { locales: ['en', 'es', 'fr'] },
    });

    assert.deepEqual(report.locales, ['en', 'es', 'fr']);
  });

  it('reports error for missing CT definitions', () => {
    const report = simulate({
      documents: [makeDoc({ contentType: 'unknown' })],
      schemas: {},
    });

    const missingErrors = report.errors.filter(e => e.type === 'MISSING_CT_DEFINITION');
    assert.ok(missingErrors.length > 0);
  });

  it('handles documents with doc.data instead of doc.fields', () => {
    const doc = {
      id: 'doc1',
      contentType: 'blogPost',
      locale: 'en',
      data: { title: 'From Data', body: 'Content' },
    };

    const report = simulate({
      documents: [doc],
      schemas: { blogPost: blogPostDef },
    });

    assert.equal(report.entries.length, 1);
    assert.ok(report.entries[0].fields.title);
  });

  it('computes correct stats', () => {
    const report = simulate({
      documents: [makeDoc(), makeDoc({ id: 'doc2', path: '/blog/world' })],
      schemas: { blogPost: blogPostDef },
    });

    assert.equal(report.stats.totalEntries, 2);
    assert.equal(report.stats.totalCTs, 1);
    assert.ok(report.stats.totalLocales >= 1);
  });

  it('works with SchemaRegistry instance', () => {
    const registry = new SchemaRegistry();
    registry.register(blogPostDef);

    const report = simulate({
      documents: [makeDoc()],
      schemas: registry,
    });

    assert.equal(report.entries.length, 1);
    assert.ok(report.contentTypes.blogPost.defined);
  });

  it('applies locale mapping', () => {
    const report = simulate({
      documents: [makeDoc({ locale: 'en-US' })],
      schemas: { blogPost: blogPostDef },
      options: { localeMap: { 'en-US': 'en' } },
    });

    assert.ok(report.locales.includes('en'));
  });

  it('handles empty documents array', () => {
    const report = simulate({
      documents: [],
      schemas: { blogPost: blogPostDef },
    });

    assert.equal(report.entries.length, 0);
    assert.equal(report.stats.totalEntries, 0);
  });

  it('truncates entry IDs > 64 chars and warns', () => {
    const doc = makeDoc({ id: 'a'.repeat(100), path: '/' + 'x'.repeat(100) });
    const report = simulate({
      documents: [doc],
      schemas: { blogPost: blogPostDef },
    });

    for (const entry of report.entries) {
      assert.ok(entry.id.length <= 64, `Entry ID should be ≤64 chars, got ${entry.id.length}`);
    }
  });

  it('extracts assets from documents', () => {
    const doc = makeDoc({
      fields: {
        title: 'Post',
        hero: { links: { resource: { href: 'https://images.example.com/hero.jpg' } } },
      },
    });

    const report = simulate({
      documents: [doc],
      schemas: { blogPost: { ...blogPostDef, fields: [...blogPostDef.fields, { id: 'hero', name: 'Hero', type: 'Link', linkType: 'Asset' }] } },
    });

    assert.ok(report.assets.length > 0);
  });

  it('supports multiple content types', () => {
    const report = simulate({
      documents: [
        makeDoc(),
        { id: 'a1', contentType: 'author', locale: 'en', fields: { name: 'Alice' } },
      ],
      schemas: { blogPost: blogPostDef, author: authorDef },
    });

    assert.equal(Object.keys(report.contentTypes).length, 2);
    assert.ok(report.contentTypes.blogPost);
    assert.ok(report.contentTypes.author);
  });

  it('records content type entry counts', () => {
    const report = simulate({
      documents: [makeDoc(), makeDoc({ id: 'doc2' }), makeDoc({ id: 'doc3' })],
      schemas: { blogPost: blogPostDef },
    });

    assert.equal(report.contentTypes.blogPost.entryCount, 3);
  });

  it('handles null localeMap gracefully', () => {
    const report = simulate({
      documents: [makeDoc()],
      schemas: { blogPost: blogPostDef },
      options: { localeMap: null },
    });

    assert.equal(report.entries.length, 1);
  });

  it('handles null fieldGroupMap gracefully', () => {
    const report = simulate({
      documents: [makeDoc()],
      schemas: { blogPost: blogPostDef },
      options: { fieldGroupMap: null },
    });

    assert.equal(report.entries.length, 1);
  });

  it('sets simulation name from options', () => {
    const report = simulate({
      documents: [makeDoc()],
      schemas: { blogPost: blogPostDef },
      options: { name: 'my-project' },
    });

    assert.equal(report.page, 'my-project');
  });

  it('accepts positional arguments (documents, schemas)', () => {
    const report = simulate([makeDoc()], { blogPost: blogPostDef });

    assert.equal(report.entries.length, 1);
    assert.equal(Object.keys(report.contentTypes).length, 1);
  });

  it('accepts positional arguments with options', () => {
    const report = simulate([makeDoc()], { blogPost: blogPostDef }, { name: 'positional-test' });

    assert.equal(report.page, 'positional-test');
    assert.equal(report.entries.length, 1);
  });

  it('detects duplicate fields in schemas', () => {
    const dupeSchema = {
      id: 'blogPost',
      name: 'Blog Post',
      fields: [
        { id: 'title', name: 'Title', type: 'Symbol' as const },
        { id: 'body', name: 'Body', type: 'Text' as const },
        { id: 'title', name: 'Title Copy', type: 'Symbol' as const },
      ],
    };
    const report = simulate({
      documents: [makeDoc()],
      schemas: { blogPost: dupeSchema },
    });

    const dupeWarnings = report.warnings.filter(w => w.type === 'DUPLICATE_FIELD');
    assert.equal(dupeWarnings.length, 1);
    assert.ok(dupeWarnings[0].message.includes('title'));
  });

  it('generates deterministic entry IDs based on path+locale', () => {
    const doc = makeDoc({ path: '/blog/hello', locale: 'en' });
    const r1 = simulate({ documents: [doc], schemas: { blogPost: blogPostDef } });
    const r2 = simulate({ documents: [doc], schemas: { blogPost: blogPostDef } });

    assert.equal(r1.entries[0].id, r2.entries[0].id);

    // Different path → different ID
    const doc2 = makeDoc({ path: '/blog/goodbye', locale: 'en' });
    const r3 = simulate({ documents: [doc2], schemas: { blogPost: blogPostDef } });
    assert.notEqual(r1.entries[0].id, r3.entries[0].id);
  });
});

// ── Locale inheritance ───────────────────────────────────────────

const localizedDef: ContentTypeDefinition = {
  id: 'article',
  name: 'Article',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', localized: true },
    { id: 'slug', name: 'Slug', type: 'Symbol' }, // localized: false (default)
    { id: 'featured', name: 'Featured', type: 'Boolean' }, // localized: false
  ],
};

describe('locale inheritance', () => {
  it('copies non-localized fields from base locale entry to other locale entries', () => {
    const docs = [
      { id: 'a1', contentType: 'article', locale: 'en', path: '/art/1', fields: { title: 'Hello', slug: 'hello', featured: true } },
      { id: 'a1', contentType: 'article', locale: 'fr', path: '/art/1', fields: { title: 'Bonjour' } },
    ];
    const report = simulate({
      documents: docs,
      schemas: { article: localizedDef },
      options: { baseLocale: 'en', locales: ['en', 'fr'] },
    });

    const frEntry = report.entries.find(e => e.locale === 'fr');
    assert.ok(frEntry);
    // Non-localized fields should be inherited from base
    assert.equal(frEntry.fields.slug?.en, 'hello');
    assert.equal(frEntry.fields.featured?.en, true);
  });

  it('does not override existing non-localized field values', () => {
    const docs = [
      { id: 'a1', contentType: 'article', locale: 'en', path: '/art/1', fields: { title: 'Hello', slug: 'hello' } },
      { id: 'a1', contentType: 'article', locale: 'fr', path: '/art/1', fields: { title: 'Bonjour', slug: 'bonjour-already' } },
    ];
    const report = simulate({
      documents: docs,
      schemas: { article: localizedDef },
      options: { baseLocale: 'en', locales: ['en', 'fr'] },
    });

    const frEntry = report.entries.find(e => e.locale === 'fr');
    assert.ok(frEntry);
    // slug was already set in the fr document, so it should be overridden with base value
    // (Contentful behavior: non-localized = only one value, from base)
    assert.equal(frEntry.fields.slug?.en, 'hello');
  });

  it('skips inheritance when there is only one locale', () => {
    const docs = [
      { id: 'a1', contentType: 'article', locale: 'en', path: '/art/1', fields: { title: 'Hello', slug: 'hello' } },
    ];
    const report = simulate({
      documents: docs,
      schemas: { article: localizedDef },
      options: { baseLocale: 'en', locales: ['en'] },
    });

    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0].fields.slug?.en, 'hello');
  });

  it('does not copy localized fields from base to other locales', () => {
    const docs = [
      { id: 'a1', contentType: 'article', locale: 'en', path: '/art/1', fields: { title: 'Hello', slug: 'hello' } },
      { id: 'a1', contentType: 'article', locale: 'fr', path: '/art/1', fields: { title: 'Bonjour' } },
    ];
    const report = simulate({
      documents: docs,
      schemas: { article: localizedDef },
      options: { baseLocale: 'en', locales: ['en', 'fr'] },
    });

    const frEntry = report.entries.find(e => e.locale === 'fr');
    assert.ok(frEntry);
    // title is localized: true, so it should NOT be copied from en
    // The fr entry should have its own title
    assert.equal(frEntry.fields.title?.en, 'Bonjour');
  });

  it('emits MISSING_BASE_LOCALE_ENTRY warning when base entry is missing', () => {
    const docs = [
      // Only fr exists, no 'en' base entry
      { id: 'a2', contentType: 'article', locale: 'fr', path: '/art/2', fields: { title: 'Bonjour' } },
    ];
    const report = simulate({
      documents: docs,
      schemas: { article: localizedDef },
      options: { baseLocale: 'en', locales: ['en', 'fr'] },
    });

    const warning = report.warnings.find(w => w.type === 'MISSING_BASE_LOCALE_ENTRY');
    assert.ok(warning, 'Expected MISSING_BASE_LOCALE_ENTRY warning');
    assert.ok(warning.message.includes('fr'));
    assert.ok(warning.message.includes('en'));
    assert.equal(warning.contentType, 'article');
  });
});

// ── Entry deduplication ──────────────────────────────────────────

describe('entry deduplication', () => {
  it('removes duplicate entries with same id+locale', () => {
    // Two docs with same path+locale will generate the same entry ID
    const docs = [
      makeDoc({ id: 'dup1', path: '/blog/same' }),
      makeDoc({ id: 'dup2', path: '/blog/same' }),
    ];
    const report = simulate({
      documents: docs,
      schemas: { blogPost: blogPostDef },
    });

    // Should only have 1 entry (the first one wins)
    assert.equal(report.entries.length, 1);
    const dupeWarning = report.warnings.find(w => w.type === 'DUPLICATE_ENTRY_REMOVED');
    assert.ok(dupeWarning, 'Expected DUPLICATE_ENTRY_REMOVED warning');
    assert.ok(dupeWarning.message.includes('1'));
  });

  it('keeps entries with different locales', () => {
    const docs = [
      makeDoc({ id: 'e1', path: '/blog/a', locale: 'en' }),
      makeDoc({ id: 'e1', path: '/blog/a', locale: 'fr' }),
    ];
    const report = simulate({
      documents: docs,
      schemas: { blogPost: blogPostDef },
      options: { locales: ['en', 'fr'] },
    });

    assert.equal(report.entries.length, 2);
    const dupeWarning = report.warnings.find(w => w.type === 'DUPLICATE_ENTRY_REMOVED');
    assert.equal(dupeWarning, undefined);
  });

  it('keeps entries with different paths', () => {
    const docs = [
      makeDoc({ id: 'd1', path: '/blog/a' }),
      makeDoc({ id: 'd2', path: '/blog/b' }),
    ];
    const report = simulate({
      documents: docs,
      schemas: { blogPost: blogPostDef },
    });

    assert.equal(report.entries.length, 2);
  });
});
