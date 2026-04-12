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
      documents: [makeDoc(), makeDoc({ id: 'doc2' })],
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
