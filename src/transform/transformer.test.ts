import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { transformGeneric, TransformerRegistry } from './transformer.js';
import type { EntryFields } from '../types.js';

/** Helper: narrow entry.fields to localized structure returned by transformGeneric */
function localized(fields: Record<string, unknown>): EntryFields {
  return fields as EntryFields;
}

const sampleDoc = {
  id: 'doc1',
  contentType: 'blogPost',
  locale: 'en',
  path: '/blog/hello-world',
  name: 'Hello World',
  fields: {
    title: 'Hello World',
    body: '<p>Content here</p>',
    views: 42,
    active: true,
    tags: ['featured', 'news'],
  },
};

describe('transformGeneric', () => {
  it('transforms a document to entry format', () => {
    const entry = transformGeneric(sampleDoc, 'en');
    assert.ok(entry._metadata);
    assert.equal(entry._metadata.contentType, 'blogPost');
    assert.ok(entry._metadata.entryId);
    assert.equal(entry._metadata.sourceId, 'doc1');
    assert.equal(entry._metadata.sourcePath, '/blog/hello-world');
  });

  it('wraps field values in locale object', () => {
    const entry = transformGeneric(sampleDoc, 'en');
    const f = localized(entry.fields);
    assert.equal(f.title.en, 'Hello World');
    assert.equal(f.body.en, '<p>Content here</p>');
    assert.equal(f.views.en, 42);
    assert.equal(f.active.en, true);
  });

  it('preserves arrays', () => {
    const entry = transformGeneric(sampleDoc, 'en');
    const f = localized(entry.fields);
    assert.deepEqual(f.tags.en, ['featured', 'news']);
  });

  it('adds internalName field', () => {
    const entry = transformGeneric(sampleDoc, 'en');
    const f = localized(entry.fields);
    assert.ok(f.internalName);
    assert.ok(typeof f.internalName.en === 'string');
  });

  it('preserves image objects', () => {
    const docWithImage = {
      ...sampleDoc,
      fields: {
        hero: { links: { resource: { href: 'https://example.com/img.jpg' } } },
      },
    };
    const entry = transformGeneric(docWithImage, 'en');
    const heroField = localized(entry.fields).hero.en as Record<string, Record<string, Record<string, string>>>;
    assert.ok(heroField.links?.resource?.href);
  });

  it('unwraps HTML value wrappers', () => {
    const docWithHtml = {
      ...sampleDoc,
      fields: { summary: { value: '<p>Hello</p>' } },
    };
    const entry = transformGeneric(docWithHtml, 'en');
    const f = localized(entry.fields);
    assert.equal(f.summary.en, '<p>Hello</p>');
  });

  it('handles null/undefined field values', () => {
    const doc = { ...sampleDoc, fields: { title: null, body: undefined } };
    const entry = transformGeneric(doc, 'en');
    const f = localized(entry.fields);
    assert.equal(f.title.en, null);
    assert.equal(f.body.en, null);
  });

  it('applies locale mapping', () => {
    const doc = { ...sampleDoc, locale: 'en-GB' };
    const entry = transformGeneric(doc, 'en', {
      mapLocale: (l) => l === 'en-GB' ? 'en' : l,
    });
    assert.ok(localized(entry.fields).title.en);
  });

  it('uses doc.data fallback when doc.fields is missing', () => {
    const doc = { id: 'x', contentType: 'ct', data: { title: 'From Data' } };
    const entry = transformGeneric(doc, 'en');
    const f = localized(entry.fields);
    assert.equal(f.title.en, 'From Data');
  });

  it('passes through small key-value objects (selects)', () => {
    const doc = {
      ...sampleDoc,
      fields: { status: { active: 'Active', label: 'Active Status' } },
    };
    const entry = transformGeneric(doc, 'en');
    const f = localized(entry.fields);
    assert.deepEqual(f.status.en, { active: 'Active', label: 'Active Status' });
  });
});

describe('TransformerRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new TransformerRegistry();
  });

  describe('register', () => {
    it('registers a custom transformer', () => {
      const fn = (doc, locale) => ({ _metadata: {}, fields: {} });
      registry.register('blogPost', fn);
      assert.equal(registry.get('blogPost'), fn);
    });

    it('registers with target type mapping', () => {
      const fn = (doc, locale) => ({ _metadata: {}, fields: {} });
      registry.register('wp_post', fn, 'blogPost');
      assert.equal(registry.getTargetType('wp_post'), 'blogPost');
    });
  });

  describe('get', () => {
    it('returns generic transformer for unregistered types', () => {
      const transformer = registry.get('unknown');
      assert.equal(typeof transformer, 'function');
      assert.equal(transformer, transformGeneric);
    });

    it('returns null for skipped types', () => {
      registry.skip(['layout']);
      assert.equal(registry.get('layout'), null);
    });
  });

  describe('skip', () => {
    it('marks types as skipped', () => {
      registry.skip(['layout', 'wrapper']);
      assert.ok(registry.isSkipped('layout'));
      assert.ok(registry.isSkipped('wrapper'));
    });

    it('non-skipped types return false', () => {
      assert.ok(!registry.isSkipped('blogPost'));
    });
  });

  describe('getTargetType', () => {
    it('returns sourceType when no mapping', () => {
      assert.equal(registry.getTargetType('blogPost'), 'blogPost');
    });

    it('returns null for skipped types', () => {
      registry.skip(['layout']);
      assert.equal(registry.getTargetType('layout'), null);
    });
  });
});
