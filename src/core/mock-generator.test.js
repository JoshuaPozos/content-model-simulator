import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateMockData } from '../../dist/core/mock-generator.js';

const blogPostDef = {
  id: 'blogPost',
  name: 'Blog Post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'slug', name: 'Slug', type: 'Symbol' },
    { id: 'body', name: 'Body', type: 'RichText' },
    { id: 'publishDate', name: 'Publish Date', type: 'Date' },
    { id: 'featured', name: 'Featured', type: 'Boolean' },
    { id: 'views', name: 'Views', type: 'Integer' },
    { id: 'rating', name: 'Rating', type: 'Number' },
    { id: 'metadata', name: 'Metadata', type: 'Object' },
    { id: 'location', name: 'Location', type: 'Location' },
    { id: 'image', name: 'Image', type: 'Link', linkType: 'Asset' },
    { id: 'author', name: 'Author', type: 'Link', linkType: 'Entry',
      validations: [{ linkContentType: ['author'] }] },
    { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Symbol' } },
    { id: 'relatedPosts', name: 'Related', type: 'Array',
      items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['blogPost'] }] } },
    { id: 'category', name: 'Category', type: 'Symbol',
      validations: [{ in: ['Tech', 'Design', 'Business'] }] },
  ],
};

const authorDef = {
  id: 'author',
  name: 'Author',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true },
    { id: 'email', name: 'Email', type: 'Symbol' },
    { id: 'bio', name: 'Bio', type: 'Text' },
  ],
};

describe('generateMockData', () => {
  it('generates documents for each content type', () => {
    const { documents } = generateMockData({ blogPost: blogPostDef, author: authorDef });
    assert.ok(documents.length > 0);
    const blogPosts = documents.filter(d => d.contentType === 'blogPost');
    const authors = documents.filter(d => d.contentType === 'author');
    assert.equal(blogPosts.length, 3); // default entriesPerType
    assert.equal(authors.length, 3);
  });

  it('respects entriesPerType option', () => {
    const { documents } = generateMockData(
      { blogPost: blogPostDef },
      { entriesPerType: 5 }
    );
    assert.equal(documents.length, 5);
  });

  it('generates entries for each locale', () => {
    const { documents } = generateMockData(
      { blogPost: blogPostDef },
      { locales: ['en', 'es'], entriesPerType: 2 }
    );
    assert.equal(documents.length, 4); // 2 entries * 2 locales
    const enDocs = documents.filter(d => d.locale === 'en');
    const esDocs = documents.filter(d => d.locale === 'es');
    assert.equal(enDocs.length, 2);
    assert.equal(esDocs.length, 2);
  });

  it('generates correct field types', () => {
    const { documents } = generateMockData(
      { blogPost: blogPostDef },
      { entriesPerType: 1 }
    );
    const doc = documents[0];
    const data = doc.data;

    // Symbol
    assert.equal(typeof data.title, 'string');

    // Slug heuristic
    assert.ok(typeof data.slug === 'string');

    // RichText
    assert.equal(data.body.nodeType, 'document');
    assert.ok(Array.isArray(data.body.content));

    // Date
    assert.ok(typeof data.publishDate === 'string');
    assert.ok(data.publishDate.includes('2026'));

    // Boolean
    assert.equal(typeof data.featured, 'boolean');

    // Integer
    assert.equal(typeof data.views, 'number');
    assert.ok(Number.isInteger(data.views));

    // Number
    assert.equal(typeof data.rating, 'number');

    // Object
    assert.equal(typeof data.metadata, 'object');
    assert.ok('key' in data.metadata);

    // Location
    assert.equal(typeof data.location.lat, 'number');
    assert.equal(typeof data.location.lon, 'number');

    // Link:Asset
    assert.equal(data.image.sys.linkType, 'Asset');

    // Link:Entry
    assert.equal(data.author.sys.linkType, 'Entry');

    // Array of Symbols
    assert.ok(Array.isArray(data.tags));
    assert.ok(data.tags.every(t => typeof t === 'string'));

    // Array of Entry links
    assert.ok(Array.isArray(data.relatedPosts));
    assert.ok(data.relatedPosts.every(l => l.sys.linkType === 'Entry'));

    // Select / in validation
    assert.ok(['Tech', 'Design', 'Business'].includes(data.category));
  });

  it('collects asset IDs and returns mock assets', () => {
    const { assets } = generateMockData({ blogPost: blogPostDef }, { entriesPerType: 1 });
    assert.ok(assets.length > 0);
    assert.ok(assets[0].id.startsWith('mock-asset-'));
    assert.ok(assets[0].file.url.startsWith('https://'));
  });

  it('is deterministic — same input produces same output', () => {
    const a = generateMockData({ blogPost: blogPostDef }, { entriesPerType: 2 });
    const b = generateMockData({ blogPost: blogPostDef }, { entriesPerType: 2 });
    assert.equal(a.documents.length, b.documents.length);
    assert.equal(a.documents[0].id, b.documents[0].id);
    assert.deepEqual(a.documents[0].data.title, b.documents[0].data.title);
  });

  it('pre-generates entry IDs for cross-references', () => {
    const schemas = { blogPost: blogPostDef, author: authorDef };
    const { documents } = generateMockData(schemas, { entriesPerType: 2 });

    // Author link in blogPost should reference a real mock author ID
    const blogDoc = documents.find(d => d.contentType === 'blogPost');
    const authorLink = blogDoc.data.author;
    const authorIds = documents.filter(d => d.contentType === 'author').map(d => d.id);
    assert.ok(authorIds.includes(authorLink.sys.id),
      `Author link ${authorLink.sys.id} should be in ${authorIds}`);
  });

  it('works with SchemaRegistry-like objects', () => {
    const schemas = {
      getAll() { return { blogPost: blogPostDef }; }
    };
    const { documents } = generateMockData(schemas, { entriesPerType: 1 });
    assert.equal(documents.length, 1);
  });

  it('handles CT with no fields', () => {
    const emptyDef = { id: 'empty', name: 'Empty', fields: [] };
    const { documents } = generateMockData({ empty: emptyDef }, { entriesPerType: 1 });
    assert.equal(documents.length, 1);
    assert.deepEqual(documents[0].data, {});
  });

  it('generates unique IDs per entry', () => {
    const { documents } = generateMockData(
      { blogPost: blogPostDef },
      { entriesPerType: 5 }
    );
    const ids = documents.map(d => d.id);
    assert.equal(new Set(ids).size, ids.length, 'IDs should be unique');
  });

  it('sets path for each document', () => {
    const { documents } = generateMockData(
      { blogPost: blogPostDef },
      { entriesPerType: 1 }
    );
    assert.ok(documents[0].path.startsWith('/blogPost/'));
  });
});
