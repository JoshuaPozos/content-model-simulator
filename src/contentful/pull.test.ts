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
import { pull } from './pull.js';

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

function mockFetchResponse(data: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function mockFetchError(status: number, body: string): Promise<Response> {
  return Promise.resolve(new Response(body, { status }));
}

describe('pull', () => {
  let originalFetch: typeof globalThis.fetch;
  let tmpDir: string;

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
      // @ts-expect-error testing missing required field
      () => pull({ accessToken: 'token', outputDir: tmpDir }),
      /Missing --space-id/
    );
  });

  it('throws on missing accessToken', async () => {
    await assert.rejects(
      // @ts-expect-error testing missing required field
      () => pull({ spaceId: 'space1', outputDir: tmpDir }),
      /Missing --access-token/
    );
  });

  it('fetches content types and locales', async () => {
    const fetchCalls: (string | URL | Request)[] = [];
    globalThis.fetch = (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      fetchCalls.push(input);
      const url = String(input);
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
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
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
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
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
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
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

    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
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
    globalThis.fetch = (): Promise<Response> => mockFetchError(401, '{"message":"Unauthorized"}');

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
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      calledUrl = String(input);
      const url = calledUrl;
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
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
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
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
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

  it('uses preview.contentful.com when usePreview is true', async () => {
    const urls: string[] = [];
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      urls.push(url);
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
      usePreview: true,
    });

    assert.ok(urls.every(u => u.startsWith('https://preview.contentful.com')),
      `Expected all URLs to use preview API, got: ${urls[0]}`);
  });

  it('uses cdn.contentful.com by default', async () => {
    const urls: string[] = [];
    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      urls.push(url);
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

    assert.ok(urls.every(u => u.startsWith('https://cdn.contentful.com')),
      `Expected all URLs to use CDA, got: ${urls[0]}`);
  });

  it('uses CMA for content types when managementToken is provided', async () => {
    const urlsAndHeaders: { url: string; auth: string }[] = [];
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string>)?.Authorization || '';
      urlsAndHeaders.push({ url, auth });
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
      accessToken: 'cda-token',
      managementToken: 'cma-token',
      outputDir: tmpDir,
    });

    // Locales should use CDA with CDA token
    const localeCall = urlsAndHeaders.find(c => c.url.includes('/locales'));
    assert.ok(localeCall?.url.startsWith('https://cdn.contentful.com'), 'Locales should use CDA');
    assert.equal(localeCall?.auth, 'Bearer cda-token');

    // Content types should use CMA with management token
    const typesCall = urlsAndHeaders.find(c => c.url.includes('/content_types'));
    assert.ok(typesCall?.url.startsWith('https://api.contentful.com'), 'Content types should use CMA');
    assert.equal(typesCall?.auth, 'Bearer cma-token');
  });

  it('preserves all field validations from CMA response', async () => {
    const ctWithValidations = {
      sys: { id: 'product', type: 'ContentType' },
      name: 'Product',
      displayField: 'name',
      fields: [
        {
          id: 'name', name: 'Name', type: 'Symbol', required: true,
          validations: [{ size: { min: 1, max: 100 } }],
        },
        {
          id: 'status', name: 'Status', type: 'Symbol',
          validations: [{ in: ['active', 'completed', 'archived', 'in-progress'] }],
        },
        {
          id: 'sku', name: 'SKU', type: 'Symbol',
          validations: [
            { unique: true },
            { regexp: { pattern: '^[A-Z]{2}-\\d{4}$', flags: null } },
          ],
        },
        {
          id: 'price', name: 'Price', type: 'Number',
          validations: [{ range: { min: 0, max: 99999 } }],
        },
        {
          id: 'tags', name: 'Tags', type: 'Array',
          items: {
            type: 'Symbol',
            validations: [{ in: ['sale', 'new', 'featured'] }],
          },
        },
        {
          id: 'category', name: 'Category', type: 'Link', linkType: 'Entry',
          validations: [{ linkContentType: ['category'] }],
        },
      ],
    };

    globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/locales')) {
        return mockFetchResponse({ items: [mockLocale], total: 1 });
      }
      if (url.includes('/content_types')) {
        return mockFetchResponse({ items: [ctWithValidations], total: 1 });
      }
      return mockFetchResponse({ items: [], total: 0 });
    };

    const result = await pull({
      spaceId: 'space1',
      accessToken: 'cda-token',
      managementToken: 'cma-token',
      outputDir: tmpDir,
    });

    const schema = result.schemas[0];

    // Allowed values (in)
    const statusField = schema.fields.find(f => f.id === 'status');
    assert.deepEqual(statusField.validations, [{ in: ['active', 'completed', 'archived', 'in-progress'] }]);

    // Unique + regexp
    const skuField = schema.fields.find(f => f.id === 'sku');
    assert.equal(skuField.validations.length, 2);
    assert.deepEqual(skuField.validations[0], { unique: true });
    assert.ok(skuField.validations[1].regexp);

    // Range
    const priceField = schema.fields.find(f => f.id === 'price');
    assert.deepEqual(priceField.validations, [{ range: { min: 0, max: 99999 } }]);

    // Size
    const nameField = schema.fields.find(f => f.id === 'name');
    assert.deepEqual(nameField.validations, [{ size: { min: 1, max: 100 } }]);

    // Array item validations
    const tagsField = schema.fields.find(f => f.id === 'tags');
    assert.deepEqual(tagsField.items.validations, [{ in: ['sale', 'new', 'featured'] }]);

    // linkContentType
    const catField = schema.fields.find(f => f.id === 'category');
    assert.deepEqual(catField.validations, [{ linkContentType: ['category'] }]);

    // Verify written to disk
    const schemaFile = path.join(tmpDir, 'schemas', 'product.js');
    const content = fs.readFileSync(schemaFile, 'utf-8');
    assert.ok(content.includes('"in-progress"'), 'Schema file should contain allowed values');
    assert.ok(content.includes('"unique"'), 'Schema file should contain unique validation');
  });
});
