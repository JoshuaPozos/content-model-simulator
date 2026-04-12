/**
 * Tests for src/contentful/pull.js
 *
 * Since pull.js uses fetch to call Contentful API, we mock global fetch
 * to test the logic without making real API calls.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pull } from '../../dist/contentful/pull.js';

const mockCT = {
  sys: { id: 'blogPost', type: 'ContentType' },
  name: 'Blog Post',
  description: 'A blog post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'body', name: 'Body', type: 'Text' },
    { id: 'image', name: 'Image', type: 'Link', linkType: 'Asset' },
    {
      id: 'tags', name: 'Tags', type: 'Array',
      items: { type: 'Symbol', validations: [{ in: ['news', 'tech'] }] },
    },
  ],
};

const mockLocale = { code: 'en-US', name: 'English (US)', default: true };
const mockLocale2 = { code: 'es', name: 'Spanish', default: false };

const mockEntry = {
  sys: { id: 'entry1', contentType: { sys: { id: 'blogPost' } } },
  fields: {
    title: { 'en-US': 'Hello World', es: 'Hola Mundo' },
    body: { 'en-US': 'Content here' },
  },
};

function mockFetchResponse(data) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockFetchError(status, body) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

describe('pull', () => {
  let originalFetch;
  let tmpDir;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-sim-pull-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws on missing spaceId', async () => {
    await assert.rejects(
      () => pull({ accessToken: 'token', outputDir: tmpDir }),
      /Missing --space-id/
    );
  });

  it('throws on missing accessToken', async () => {
    await assert.rejects(
      () => pull({ spaceId: 'space1', outputDir: tmpDir }),
      /Missing --access-token/
    );
  });

  it('fetches content types and locales', async () => {
    const fetchCalls = [];
    globalThis.fetch = (url, opts) => {
      fetchCalls.push(url);
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    const result = await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: tmpDir,
    });

    assert.equal(result.schemas.length, 1);
    assert.equal(result.schemas[0].id, 'blogPost');
    assert.equal(result.schemas[0].name, 'Blog Post');
    assert.deepEqual(result.locales, ['en-US']);
    assert.equal(result.defaultLocale, 'en-US');
  });

  it('converts content types to schema format correctly', async () => {
    globalThis.fetch = (url) => {
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    const result = await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: tmpDir,
    });

    const schema = result.schemas[0];
    assert.equal(schema.id, 'blogPost');
    assert.equal(schema.displayField, 'title');
    assert.equal(schema.fields.length, 4);

    // Check required and localized flags
    const titleField = schema.fields.find(f => f.id === 'title');
    assert.equal(titleField.required, true);
    assert.equal(titleField.localized, true);

    // Check Link field
    const imageField = schema.fields.find(f => f.id === 'image');
    assert.equal(imageField.linkType, 'Asset');

    // Check Array items
    const tagsField = schema.fields.find(f => f.id === 'tags');
    assert.equal(tagsField.items.type, 'Symbol');
    assert.ok(tagsField.items.validations);
  });

  it('writes schema files to disk', async () => {
    globalThis.fetch = (url) => {
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: tmpDir,
    });

    // Schema file
    const schemaFile = path.join(tmpDir, 'schemas', 'blogPost.js');
    assert.ok(fs.existsSync(schemaFile), 'Schema file should exist');
    const content = fs.readFileSync(schemaFile, 'utf-8');
    assert.ok(content.includes('export default'));
    assert.ok(content.includes('"blogPost"'));

    // Space metadata
    const spaceFile = path.join(tmpDir, 'contentful-space.json');
    assert.ok(fs.existsSync(spaceFile));
    const spaceMeta = JSON.parse(fs.readFileSync(spaceFile, 'utf-8'));
    assert.equal(spaceMeta.baseLocale, 'en-US');
    assert.equal(spaceMeta.space, 'space1');
  });

  it('fetches entries when includeEntries=true', async () => {
    globalThis.fetch = (url) => {
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale, mockLocale2], total: 2 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      if (url.includes('/entries')) {
        return mockFetchResponse({ items: [mockEntry], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    const result = await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: tmpDir,
      includeEntries: true,
    });

    assert.ok(result.documents);
    assert.ok(result.documents.length > 0);

    // Should expand across locales
    const enDoc = result.documents.find(d => d.locale === 'en-US');
    const esDoc = result.documents.find(d => d.locale === 'es');
    assert.ok(enDoc, 'Should have en-US document');
    assert.ok(esDoc, 'Should have es document');
    assert.equal(enDoc.data.title, 'Hello World');
    assert.equal(esDoc.data.title, 'Hola Mundo');

    // NDJSON file should be written
    const ndjsonFile = path.join(tmpDir, 'data', 'entries.ndjson');
    assert.ok(fs.existsSync(ndjsonFile));
  });

  it('respects maxEntries limit', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      sys: { id: `entry${i}`, contentType: { sys: { id: 'blogPost' } } },
      fields: { title: { 'en-US': `Entry ${i}` } },
    }));

    globalThis.fetch = (url) => {
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      if (url.includes('/entries')) {
        return mockFetchResponse({ items: entries, total: 5 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    const result = await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: tmpDir,
      includeEntries: true,
      maxEntries: 2,
    });

    assert.equal(result.documents.length, 2);
  });

  it('throws on API errors', async () => {
    globalThis.fetch = () => mockFetchError(401, '{"message":"Unauthorized"}');

    await assert.rejects(
      () => pull({
        spaceId: 'space1',
        accessToken: 'bad-token',
        outputDir: tmpDir,
      }),
      /Contentful API 401/
    );
  });

  it('uses CDA base URL by default', async () => {
    let calledUrl = '';
    globalThis.fetch = (url) => {
      calledUrl = url;
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: tmpDir,
    });

    assert.ok(calledUrl.includes('cdn.contentful.com'));
  });

  it('skips disk write when outputDir is falsy', async () => {
    globalThis.fetch = (url) => {
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    // Should not throw
    const result = await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: '',
    });

    assert.equal(result.schemas.length, 1);
  });

  it('does not include entries in result when includeEntries=false', async () => {
    globalThis.fetch = (url) => {
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [mockCT], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    const result = await pull({
      spaceId: 'space1',
      accessToken: 'token123',
      outputDir: tmpDir,
    });

    assert.equal(result.documents, null);
  });
});
